/**
 * ADR-015: when the provider takes a payment back (successful to reversed), the money leaves the ledger too.
 * The balance never goes negative (I2), and what could not be taken back is recorded as a shortfall that blocks payouts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  PERMISSION_DENIED,
  UNIQUE_VIOLATION,
  asRole,
  balanceOf,
  closePool,
  createMember,
  createPayout,
  expectDbError,
  fundMember,
  gg,
  ledgerCount,
  one,
  q,
  raceWhileFirstIsOpen,
  resetDatabase,
  setAttemptStatus,
} from "./helpers";

let owner: string;

beforeAll(async () => {
  await resetDatabase();
  owner = await createMember({ name: "The Owner" });
  await q("select bootstrap_owner($1)", [owner]);
});
afterAll(closePool);

const reverse = (attempt: string) => setAttemptStatus(attempt, "reversed");
const spend = (member: string, kobo: number) =>
  q("select * from ledger_post(p_member => $1::uuid, p_type => 'adjustment_debit', p_amount => $2::bigint, p_reason => 'spent before reversal')", [member, kobo]);
const shortfalls = (member: string) =>
  q<{ id: string; amount_kobo: string; resolved_at: Date | null }>("select id, amount_kobo, resolved_at from payment_shortfalls where member_id = $1", [member]);
const setStatus = (id: string, status: string, extra = "") =>
  q(`update payout_requests set status = $2::payout_status ${extra} where id = $1`, [id, status]);

describe("a reversed payment takes its credit back out", () => {
  it("posts exactly one reversal debit for the full amount and the balance returns to zero", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await reverse(attempt);
    const rows = await q<{ entry_type: string; direction: string; amount_kobo: string; payment_attempt_id: string }>(
      "select entry_type, direction, amount_kobo, payment_attempt_id from ledger_entries where member_id = $1 and entry_type = 'payment_reversal_debit'",
      [m],
    );
    expect(rows).toEqual([{ entry_type: "payment_reversal_debit", direction: "debit", amount_kobo: "100000", payment_attempt_id: attempt }]);
    expect(await balanceOf(m)).toEqual({ ledger: 0, held: 0, available: 0 });
    expect(await shortfalls(m)).toEqual([]);
  });

  it("takes back only that payment when the member has saved more", async () => {
    const m = await createMember();
    const first = await fundMember(m, 100_000);
    await fundMember(m, 50_000);
    await reverse(first);
    expect(await balanceOf(m)).toEqual({ ledger: 50_000, held: 0, available: 50_000 });
  });

  it("never touches another member", async () => {
    const a = await createMember();
    const b = await createMember();
    const attempt = await fundMember(a, 100_000);
    await fundMember(b, 100_000);
    await reverse(attempt);
    expect((await balanceOf(b)).ledger).toBe(100_000);
    expect(await ledgerCount(b, "payment_reversal_debit")).toBe(0);
  });

  it("running the reversal again changes nothing", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await reverse(attempt);
    const again = await q<{ created: boolean; debited_kobo: string }>("select created, debited_kobo from ledger_reverse_payment($1)", [attempt]);
    expect(again).toEqual([{ created: false, debited_kobo: "100000" }]);
    expect(await ledgerCount(m, "payment_reversal_debit")).toBe(1);
  });

  it("the database refuses a second reversal debit for the same payment, even inserted directly", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await fundMember(m, 100_000);
    await reverse(attempt);
    await expectDbError(
      q("insert into ledger_entries (member_id, entry_type, direction, amount_kobo, payment_attempt_id, reason) values ($1, 'payment_reversal_debit', 'debit', 1, $2, 'again')", [m, attempt]),
      UNIQUE_VIOLATION,
    );
  });

  it("only a reversed payment can be taken back", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await expectDbError(q("select * from ledger_reverse_payment($1)", [attempt]), gg("CONFLICT"));
    await expectDbError(q("select * from ledger_reverse_payment(gen_random_uuid())", []), gg("CONFLICT"));
  });

  it("a reversal entry must reference the payment and be a debit", async () => {
    const m = await createMember();
    await expectDbError(q("insert into ledger_entries (member_id, entry_type, direction, amount_kobo, reason) values ($1, 'payment_reversal_debit', 'debit', 100, 'no attempt')", [m]), CHECK_VIOLATION);
    const attempt = await fundMember(m, 1_000);
    await expectDbError(
      q("insert into ledger_entries (member_id, entry_type, direction, amount_kobo, payment_attempt_id, reason) values ($1, 'payment_reversal_debit', 'credit', 100, $2, 'wrong direction')", [m, attempt]),
      CHECK_VIOLATION,
    );
  });

  it("two simultaneous reversals of one payment post a single debit", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    const race = await raceWhileFirstIsOpen("update payment_attempts set status = 'reversed' where id = $1 and status = 'successful'", [attempt]);
    expect(race.secondWasBlocked, "the second reversal must wait on the first").toBe(true);
    expect(race.second).toBe("ok");
    expect(await ledgerCount(m, "payment_reversal_debit")).toBe(1);
    expect((await balanceOf(m)).ledger).toBe(0);
  });
});

describe("money the member already spent becomes a shortfall, never a negative balance (I2)", () => {
  it("takes what is left and records the rest", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await spend(m, 70_000);
    await reverse(attempt);
    expect(await balanceOf(m)).toEqual({ ledger: 0, held: 0, available: 0 });
    expect(await ledgerCount(m, "payment_reversal_debit")).toBe(1);
    const [row] = await shortfalls(m);
    expect(Number(row.amount_kobo)).toBe(70_000);
    expect(row.resolved_at).toBeNull();
  });

  it("with nothing left, posts no entry and records the whole amount once", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await spend(m, 100_000);
    await reverse(attempt);
    expect(await ledgerCount(m, "payment_reversal_debit")).toBe(0);
    expect((await shortfalls(m)).map((s) => Number(s.amount_kobo))).toEqual([100_000]);
    const again = await q<{ created: boolean; shortfall_kobo: string }>("select created, shortfall_kobo from ledger_reverse_payment($1)", [attempt]);
    expect(again).toEqual([{ created: false, shortfall_kobo: "100000" }]);
    expect(await shortfalls(m)).toHaveLength(1);
    expect((await balanceOf(m)).ledger).toBe(0);
  });

  it("money already sent in a processing payout is not taken back, and that payout can still be marked paid", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    const payout = await createPayout(m, 60_000);
    await setStatus(payout, "verified");
    await setStatus(payout, "approved");
    await setStatus(payout, "processing");
    await reverse(attempt);
    expect(await ledgerCount(m, "payment_reversal_debit")).toBe(1);
    expect((await q<{ amount_kobo: string }>("select amount_kobo from ledger_entries where member_id = $1 and entry_type = 'payment_reversal_debit'", [m]))[0].amount_kobo).toBe("40000");
    expect((await shortfalls(m)).map((s) => Number(s.amount_kobo))).toEqual([60_000]);
    await setStatus(payout, "paid", ", provider_transfer_ref = 'trf_reversal_001'");
    expect((await balanceOf(m)).ledger).toBe(0);
  });
});

describe("an open shortfall blocks payouts until the owner resolves it", () => {
  async function memberWithShortfall() {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await spend(m, 100_000);
    await reverse(attempt);
    const [row] = await shortfalls(m);
    return { m, shortfallId: row.id };
  }

  it("a new payout request is refused", async () => {
    const { m } = await memberWithShortfall();
    await fundMember(m, 50_000);
    await expectDbError(createPayout(m, 10_000), gg("PAYOUT_NOT_ELIGIBLE"));
  });

  it("a payout opened earlier cannot be approved or sent", async () => {
    const m = await createMember();
    const lost = await fundMember(m, 100_000);
    const payout = await createPayout(m, 50_000);
    await setStatus(payout, "verified");
    await spend(m, 50_000);
    await reverse(lost);
    await fundMember(m, 100_000);
    expect(await shortfalls(m)).toHaveLength(1);
    await expectDbError(setStatus(payout, "approved"), gg("PAYOUT_NOT_ELIGIBLE"));
    await setStatus(payout, "rejected", ", decision_note = 'Open shortfall'");
  });

  it("resolving it lets the member withdraw again", async () => {
    const { m, shortfallId } = await memberWithShortfall();
    await fundMember(m, 50_000);
    await q("select payment_shortfall_resolve($1, $2, 'forgiven', 'Owner absorbs the loss')", [shortfallId, owner]);
    await createPayout(m, 10_000);
  });

  it("only someone holding admin.ledger.adjust may resolve", async () => {
    const { shortfallId } = await memberWithShortfall();
    const admin = await createMember();
    await q("insert into member_roles (member_id, role) values ($1, 'admin')", [admin]);
    await expectDbError(q("select payment_shortfall_resolve($1, $2, 'forgiven', 'Trying anyway')", [shortfallId, admin]), gg("PERMISSION_DENIED"));
    await expectDbError(q("select payment_shortfall_resolve($1, $2, 'forgiven', 'Trying anyway')", [shortfallId, await createMember()]), gg("PERMISSION_DENIED"));
  });

  it("resolving needs a note and a valid outcome, and works once", async () => {
    const { shortfallId } = await memberWithShortfall();
    await expectDbError(q("select payment_shortfall_resolve($1, $2, 'forgiven', 'x')", [shortfallId, owner]), gg("VALIDATION_FAILED"));
    await expectDbError(q("select payment_shortfall_resolve($1, $2, 'ignored', 'A good reason')", [shortfallId, owner]), gg("VALIDATION_FAILED"));
    await q("select payment_shortfall_resolve($1, $2, 'repaid', 'Member paid the owner by transfer')", [shortfallId, owner]);
    await expectDbError(q("select payment_shortfall_resolve($1, $2, 'forgiven', 'Second try')", [shortfallId, owner]), gg("NOT_FOUND"));
  });

  it("a resolved shortfall cannot be edited and no shortfall can be deleted", async () => {
    const { shortfallId } = await memberWithShortfall();
    await q("select payment_shortfall_resolve($1, $2, 'forgiven', 'Owner absorbs the loss')", [shortfallId, owner]);
    await expectDbError(q("update payment_shortfalls set amount_kobo = 1 where id = $1", [shortfallId]), gg("CONFLICT"));
    await expectDbError(q("update payment_shortfalls set resolution = 'repaid' where id = $1", [shortfallId]), gg("CONFLICT"));
    await expectDbError(q("delete from payment_shortfalls where id = $1", [shortfallId]), gg("CONFLICT"));
  });
});

describe("a payout the ledger no longer covers cannot move forward", () => {
  it("a reversal that takes the money behind a requested payout stops it at approval", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    const payout = await createPayout(m, 60_000);
    await setStatus(payout, "verified");
    await reverse(attempt);
    expect(await shortfalls(m)).toEqual([]);
    await expectDbError(setStatus(payout, "approved"), gg("PAYOUT_INSUFFICIENT_BALANCE"));
    await setStatus(payout, "rejected", ", decision_note = 'Payment was reversed'");
  });
});

describe("who can see and do what", () => {
  it("a member sees their own reversal entry but nothing about shortfalls", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await reverse(attempt);
    const rows = await asRole("authenticated", m, (c) => c.query<{ entry_type: string }>("select entry_type from ledger_entries order by created_at"));
    expect(rows.rows.map((r) => r.entry_type)).toEqual(["contribution_credit", "payment_reversal_debit"]);
    await expectDbError(asRole("authenticated", m, (c) => c.query("select * from payment_shortfalls")), PERMISSION_DENIED);
    await expectDbError(asRole("anon", null, (c) => c.query("select * from payment_shortfalls")), PERMISSION_DENIED);
    await expectDbError(asRole("authenticated", m, (c) => c.query("select * from ledger_reverse_payment($1)", [attempt])), PERMISSION_DENIED);
    await expectDbError(asRole("authenticated", m, (c) => c.query("select payment_shortfall_resolve(gen_random_uuid(), $1, 'forgiven', 'self serve')", [m])), PERMISSION_DENIED);
  });

  it("the server role cannot delete a shortfall or change the ledger", async () => {
    await expectDbError(asRole("service_role", null, (c) => c.query("delete from payment_shortfalls")), PERMISSION_DENIED);
    await expectDbError(asRole("service_role", null, (c) => c.query("update ledger_entries set amount_kobo = 1")), PERMISSION_DENIED);
  });

  it("the reversal debit is a normal ledger row: the balance equals the sum of the entries", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await fundMember(m, 25_000);
    await reverse(attempt);
    const sum = await one<{ s: string }>("select sum(case direction when 'credit' then amount_kobo else -amount_kobo end)::text as s from ledger_entries where member_id = $1", [m]);
    expect(Number(sum.s)).toBe(25_000);
    expect((await balanceOf(m)).ledger).toBe(25_000);
  });
});
