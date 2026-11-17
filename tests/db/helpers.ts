/**
 * Shared harness for the database tests (owner: AI-1).
 *
 * The tests run against a real PostgreSQL named by TEST_DATABASE_URL. `resetDatabase()` DROPS the
 * `public` schema and rebuilds it from supabase/migrations, so it refuses to run against anything
 * that is not a local database. Never point TEST_DATABASE_URL at a hosted Supabase project.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SHIM_FILE = join(ROOT, "tests", "db", "supabase-shim.sql");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Throws unless the URL points at this machine. The reset below destroys the public schema. */
export function assertLocalDatabase(raw: string | undefined): string {
  if (!raw) {
    throw new Error("TEST_DATABASE_URL is not set. Point it at a disposable local PostgreSQL, for example postgres://postgres:postgres@127.0.0.1:5432/gg_test");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid connection URL");
  }
  const socketDir = url.searchParams.get("host");
  const isSocket = url.hostname === "" && socketDir !== null && socketDir.startsWith("/");
  if (!isSocket && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run: TEST_DATABASE_URL host "${url.hostname}" is not local. These tests drop the public schema.`,
    );
  }
  return raw;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: assertLocalDatabase(process.env.TEST_DATABASE_URL), max: 6 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** Rebuilds the schema from the migration files, like a first deploy on an empty project. */
export async function resetDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(readFileSync(SHIM_FILE, "utf8"));
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    await client.query("delete from auth.users");
    // Mirror a fresh Supabase project: the API roles can reach the schema and objects start out granted.
    // Migration 1900 must take these away. If it did not, the deny by default tests would fail.
    await client.query("grant usage on schema public to anon, authenticated, service_role");
    await client.query("alter default privileges in schema public grant all on tables to anon, authenticated, service_role");
    await client.query("alter default privileges in schema public grant all on sequences to anon, authenticated, service_role");
    await client.query("alter default privileges in schema public grant all on functions to anon, authenticated, service_role");
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}: ${sql}`);
  return rows[0];
}

export type DbRole = "anon" | "authenticated" | "service_role";

/**
 * Runs `fn` inside a transaction as one of the API roles, with auth.uid() set to `memberId`.
 * Rolls back unless `commit` is set, so read and negative tests leave nothing behind.
 */
export async function asRole<T>(
  role: DbRole,
  memberId: string | null,
  fn: (c: PoolClient) => Promise<T>,
  opts: { commit?: boolean } = {},
): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    if (memberId) {
      await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [
        memberId,
        JSON.stringify({ sub: memberId, role }),
      ]);
    }
    const out = await fn(c);
    await c.query(opts.commit ? "commit" : "rollback");
    return out;
  } catch (err) {
    try {
      await c.query("rollback");
    } catch {
      // the connection is already unusable, the original error matters more
    }
    throw err;
  } finally {
    c.release();
  }
}

/**
 * Deterministic concurrency probe. Transaction one runs `sql` and is left OPEN. Transaction two then runs the same
 * statement. If the database serialises the two (row lock), transaction two is blocked until one commits. Without
 * the lock it would finish immediately while one is still open, which is the race this guards against.
 * Transaction one is always committed, then transaction two's outcome is returned.
 */
export async function raceWhileFirstIsOpen(
  sql: string,
  params: unknown[],
): Promise<{ secondWasBlocked: boolean; second: "ok" | { message: string } }> {
  const first = await getPool().connect();
  const second = await getPool().connect();
  try {
    await first.query("begin");
    await second.query("begin");
    await first.query(sql, params);
    const pending = second.query(sql, params).then(
      () => "ok" as const,
      (err: Error) => ({ message: err.message }),
    );
    const early = await Promise.race([pending, new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 500))]);
    const secondWasBlocked = early === "blocked";
    await first.query("commit");
    const outcome = await pending;
    await second.query(outcome === "ok" ? "commit" : "rollback");
    return { secondWasBlocked, second: outcome };
  } finally {
    first.release();
    second.release();
  }
}

type DbErrorMatch = { code?: string; message?: string };

/** A contract error raised by raise_gg(): SQLSTATE GG001 and the contract code as the message. */
export const gg = (code: string): DbErrorMatch => ({ code: "GG001", message: code });
export const PERMISSION_DENIED: DbErrorMatch = { code: "42501" };
export const UNIQUE_VIOLATION: DbErrorMatch = { code: "23505" };
export const CHECK_VIOLATION: DbErrorMatch = { code: "23514" };

/** Fails the test unless the promise rejects with a database error that matches. */
export async function expectDbError(promise: Promise<unknown>, match: DbErrorMatch): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  if (caught === null) throw new Error("expected a database error, but the statement succeeded");
  const e = caught as { code?: string; message?: string };
  if (match.code !== undefined) expect(e.code, `SQLSTATE (message: ${e.message})`).toBe(match.code);
  if (match.message !== undefined) expect(e.message).toBe(match.message);
}

// Fixtures --------------------------------------------------------------------------------------------

export type SeedMemberOptions = { email?: string; name?: string; status?: "pending_verification" | "active" | "suspended" | "closed" };

/** Creates an auth user. The bootstrap trigger (1120) creates the profile, ledger anchor and member role. */
export async function createMember(opts: SeedMemberOptions = {}): Promise<string> {
  const id = randomUUID();
  const email = opts.email ?? `m_${id.slice(0, 8)}@example.ng`;
  await q("insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)", [
    id,
    email,
    JSON.stringify({ full_name: opts.name ?? "Test Member" }),
  ]);
  const status = opts.status ?? "active";
  if (status !== "pending_verification") await q("update members set status = $2 where id = $1", [id, status]);
  return id;
}

export async function createAttempt(
  memberId: string,
  amountKobo: number,
  over: { obligationId?: string | null; purpose?: string; idempotencyKey?: string; reference?: string } = {},
): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into payment_attempts (member_id, purpose, amount_kobo, reference, idempotency_key, obligation_id)
     values ($1, $2::payment_purpose, $3, $4, $5, $6) returning id`,
    [
      memberId,
      over.purpose ?? "one_time_contribution",
      amountKobo,
      over.reference ?? `ref_${randomUUID()}`,
      over.idempotencyKey ?? `idem_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      over.obligationId ?? null,
    ],
  );
  return row.id;
}

export async function setAttemptStatus(attemptId: string, status: string): Promise<void> {
  await q("update payment_attempts set status = $2::payment_attempt_status where id = $1", [attemptId, status]);
}

/** Walks a new attempt through the legal path to `successful`, which posts the ledger credit. */
export async function settleAttempt(attemptId: string): Promise<void> {
  for (const status of ["processing", "verifying", "successful"]) await setAttemptStatus(attemptId, status);
}

/** A confirmed contribution: attempt created and settled. Returns the attempt id. */
export async function fundMember(memberId: string, amountKobo: number): Promise<string> {
  const attemptId = await createAttempt(memberId, amountKobo);
  await settleAttempt(attemptId);
  return attemptId;
}

export type Balance = { ledger: number; held: number; available: number };

export async function balanceOf(memberId: string): Promise<Balance> {
  const r = await one<{ ledger_kobo: string; held_kobo: string; available_kobo: string }>(
    "select * from member_balance($1)",
    [memberId],
  );
  return { ledger: Number(r.ledger_kobo), held: Number(r.held_kobo), available: Number(r.available_kobo) };
}

export async function createPayout(memberId: string, amountKobo: number): Promise<string> {
  const r = await one<{ id: string }>(
    "select payout_create($1::uuid, $2::bigint, '058', 'Test Bank', '0123456789', 'Test Member') as id",
    [memberId, amountKobo],
  );
  return r.id;
}

export async function createPlan(memberId: string, amountKobo = 50000): Promise<string> {
  const r = await one<{ id: string }>(
    "insert into contribution_plans (member_id, frequency, amount_kobo, starts_on) values ($1, 'weekly', $2, current_date) returning id",
    [memberId, amountKobo],
  );
  return r.id;
}

export async function createObligation(planId: string, memberId: string, dueOn: string, amountKobo = 50000): Promise<string> {
  const r = await one<{ id: string }>(
    "insert into contribution_obligations (plan_id, member_id, due_on, amount_kobo) values ($1, $2, $3, $4) returning id",
    [planId, memberId, dueOn, amountKobo],
  );
  return r.id;
}

export async function ledgerCount(memberId: string, entryType?: string): Promise<number> {
  const r = await one<{ n: string }>(
    "select count(*)::text as n from ledger_entries where member_id = $1 and ($2::text is null or entry_type::text = $2)",
    [memberId, entryType ?? null],
  );
  return Number(r.n);
}
