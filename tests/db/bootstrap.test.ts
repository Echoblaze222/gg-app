import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  UNIQUE_VIOLATION,
  closePool,
  createMember,
  expectDbError,
  gg,
  one,
  q,
  resetDatabase,
} from "./helpers";

beforeAll(resetDatabase);
afterAll(closePool);

const hasPermission = async (member: string, permission: string) =>
  (await one<{ ok: boolean }>("select has_permission($1, $2) as ok", [member, permission])).ok;

describe("D12: a new auth user gets everything in one transaction", () => {
  it("creates the profile, the ledger anchor and the member role", async () => {
    const id = randomUUID();
    await q("insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, 'ada@example.ng', now(), $2)", [
      id,
      JSON.stringify({ full_name: "Ada Lovelace" }),
    ]);
    const member = await one<{ email: string; full_name: string; status: string; email_verified_at: Date | null }>(
      "select email, full_name, status, email_verified_at from members where id = $1",
      [id],
    );
    // Already confirmed by the identity provider, so migration 2001 activates the member in the same transaction.
    expect(member).toMatchObject({ email: "ada@example.ng", full_name: "Ada Lovelace", status: "active" });
    expect(member.email_verified_at).not.toBeNull();
    expect((await q("select 1 from ledger_accounts where member_id = $1", [id])).length).toBe(1);
    const roles = await q<{ role: string }>("select role from member_roles where member_id = $1", [id]);
    expect(roles.map((r) => r.role)).toEqual(["member"]);
  });

  it("an unconfirmed email stays unverified", async () => {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, 'unverified@example.ng')", [id]);
    const row = await one<{ email_verified_at: Date | null; status: string }>("select email_verified_at, status from members where id = $1", [id]);
    expect(row.email_verified_at).toBeNull();
    expect(row.status).toBe("pending_verification");
  });

  it("confirming the email later activates a pending member (migration 2001)", async () => {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, 'later@example.ng')", [id]);
    await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
    const row = await one<{ email_verified_at: Date | null; status: string }>("select email_verified_at, status from members where id = $1", [id]);
    expect(row.status).toBe("active");
    expect(row.email_verified_at).not.toBeNull();
  });

  it.each(["suspended", "closed"] as const)("confirming an email never reactivates a %s member", async (status) => {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, $2)", [id, `${status}@example.ng`]);
    await q("update members set status = $2 where id = $1", [id, status]);
    await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
    expect((await one<{ status: string }>("select status from members where id = $1", [id])).status).toBe(status);
  });

  it("falls back to the part of the email before the @ when no name is given", async () => {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, 'chidi.okafor@example.ng')", [id]);
    expect((await one<{ full_name: string }>("select full_name from members where id = $1", [id])).full_name).toBe("chidi.okafor");
  });

  it("pads a one character name and trims a very long one to 100", async () => {
    const short = randomUUID();
    await q("insert into auth.users (id, email) values ($1, 'a@example.ng')", [short]);
    expect((await one<{ full_name: string }>("select full_name from members where id = $1", [short])).full_name).toBe("a_");
    const long = randomUUID();
    await q("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'long@example.ng', $2)", [
      long,
      JSON.stringify({ full_name: "N".repeat(300) }),
    ]);
    expect((await one<{ full_name: string }>("select full_name from members where id = $1", [long])).full_name).toHaveLength(100);
  });

  it("a user without an email is refused and nothing is left behind", async () => {
    const id = randomUUID();
    await expectDbError(q("insert into auth.users (id) values ($1)", [id]), { code: "GG001", message: "email is required" });
    expect(await q("select 1 from auth.users where id = $1", [id])).toHaveLength(0);
  });

  it("emails are unique regardless of case, and a clash rolls the whole signup back", async () => {
    await q("insert into auth.users (id, email) values ($1, 'Case.Test@example.ng')", [randomUUID()]);
    const id = randomUUID();
    await expectDbError(q("insert into auth.users (id, email) values ($1, 'case.test@EXAMPLE.ng')", [id]), UNIQUE_VIOLATION);
    expect(await q("select 1 from auth.users where id = $1", [id])).toHaveLength(0);
    expect(await q("select 1 from ledger_accounts where member_id = $1", [id])).toHaveLength(0);
  });

  it("a member cannot be removed while they have history (on delete restrict)", async () => {
    const m = await createMember();
    await expectDbError(q("delete from auth.users where id = $1", [m]), { code: "23503" });
  });
});

describe("D11: exactly one owner", () => {
  it("bootstrap_owner makes the member the owner and activates the account", async () => {
    const m = await createMember({ status: "pending_verification" });
    await q("select bootstrap_owner($1)", [m]);
    expect((await one<{ status: string }>("select status from members where id = $1", [m])).status).toBe("active");
    const roles = await q<{ role: string }>("select role from member_roles where member_id = $1", [m]);
    expect(roles.map((r) => r.role).sort()).toEqual(["member", "owner"]);
  });

  it("a second owner is refused by the database", async () => {
    const second = await createMember();
    await expectDbError(q("select bootstrap_owner($1)", [second]), UNIQUE_VIOLATION);
    expect(await q("select 1 from member_roles where role = 'owner'")).toHaveLength(1);
  });
});

describe("has_permission", () => {
  it("a member holds only the member permissions", async () => {
    const m = await createMember();
    expect(await hasPermission(m, "member.payout.request")).toBe(true);
    expect(await hasPermission(m, "admin.members.read")).toBe(false);
    expect(await hasPermission(m, "admin.payouts.decide")).toBe(false);
  });

  it("the owner holds everything, including role management and ledger adjustments", async () => {
    const owner = await one<{ member_id: string }>("select member_id from member_roles where role = 'owner'");
    for (const p of ["admin.roles.manage", "admin.ledger.adjust", "admin.settings.update", "admin.payouts.decide"]) {
      expect(await hasPermission(owner.member_id, p), p).toBe(true);
    }
  });

  it("an admin holds everything except roles, ledger adjustments and settings", async () => {
    const m = await createMember();
    await q("insert into member_roles (member_id, role) values ($1, 'admin')", [m]);
    expect(await hasPermission(m, "admin.payouts.decide")).toBe(true);
    for (const p of ["admin.roles.manage", "admin.ledger.adjust", "admin.settings.update"]) {
      expect(await hasPermission(m, p), p).toBe(false);
    }
  });

  it("support can read members and answer tickets but not decide payouts", async () => {
    const m = await createMember();
    await q("insert into member_roles (member_id, role) values ($1, 'support')", [m]);
    expect(await hasPermission(m, "admin.support.reply")).toBe(true);
    expect(await hasPermission(m, "admin.payouts.decide")).toBe(false);
    expect(await hasPermission(m, "admin.payouts.read")).toBe(false);
  });

  it.each(["pending_verification", "suspended", "closed"] as const)("a %s member holds no permission at all", async (status) => {
    const m = await createMember({ status });
    await q("insert into member_roles (member_id, role) values ($1, 'admin')", [m]);
    expect(await hasPermission(m, "member.profile.read")).toBe(false);
    expect(await hasPermission(m, "admin.members.read")).toBe(false);
  });

  it("an unknown member holds nothing", async () => {
    expect(await hasPermission("00000000-0000-4000-8000-000000000003", "member.profile.read")).toBe(false);
  });
});

describe("member profile constraints", () => {
  it("a phone number is unique, and a name must be 2 to 100 characters", async () => {
    const a = await createMember();
    const b = await createMember();
    await q("update members set phone = '+2348012345678' where id = $1", [a]);
    await expectDbError(q("update members set phone = '+2348012345678' where id = $1", [b]), UNIQUE_VIOLATION);
    await expectDbError(q("update members set full_name = 'A' where id = $1", [a]), { code: "23514" });
    await expectDbError(q("update members set full_name = $2 where id = $1", [a, "x".repeat(101)]), { code: "23514" });
  });

  it("updated_at moves forward on every change", async () => {
    const m = await createMember();
    const before = await one<{ updated_at: Date }>("select updated_at from members where id = $1", [m]);
    await q("select pg_sleep(0.01)");
    await q("update members set full_name = 'Renamed Member' where id = $1", [m]);
    const after = await one<{ updated_at: Date }>("select updated_at from members where id = $1", [m]);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it("raise_gg raises the contract code with the GG001 state", async () => {
    await expectDbError(q("select raise_gg('NOT_FOUND')"), gg("NOT_FOUND"));
  });
});
