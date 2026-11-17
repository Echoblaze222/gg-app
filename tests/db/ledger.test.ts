import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  PERMISSION_DENIED,
  UNIQUE_VIOLATION,
  asRole,
  balanceOf,
  closePool,
  createAttempt,
  createMember,
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
import { MAX_AMOUNT_KOBO } from "@/contracts/schemas";

beforeAll(resetDatabase);
afterAll(closePool);

const post = (member: string, type: string, amount: number, extra: { attempt?: string; reason?: string } = {}) =>
  q<{ entry_id: string; created: boolean }>(
    "select * from ledger_post(p_member => $1::uuid, p_type => $2::ledger_entry_type, p_amount => $3::bigint, p_attempt => $4::uuid, p_reason => $5)",
    [member, type, amount, extra.attempt ?? null, extra.reason ?? null],
  );

describe("I3: a confirmed payment produces exactly one credit", () => {
  it("settling an attempt posts one contribution credit with a receipt number", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 250_000);
    const rows = await q<{ amount_kobo: string; direction: string; receipt_number: string; payment_attempt_id: string }>(
      "select * from ledger_entries where member_id = $1",
      [m],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe("credit");
    expect(Number(rows[0].amount_kobo)).toBe(250_000);
    expect(rows[0].payment_attempt_id).toBe(attempt);
    expect(rows[0].receipt_number).toMatch(/^GGR-\d{6}-\d{6}$/);
  });

  it("posting the same credit again changes nothing and returns the existing entry", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    const [{ id: first }] = await q<{ id: string }>("select id from ledger_entries where member_id = $1", [m]);
    const again = await post(m, "contribution_credit", 100_000, { attempt });
    expect(again).toEqual([{ entry_id: first, created: false }]);
    expect(await ledgerCount(m)).toBe(1);
  });

  it("the database refuses a second credit for the same attempt even if inserted directly", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    await expectDbError(
      q(
        `insert into ledger_entries (member_id, entry_type, direction, amount_kobo, payment_attempt_id, receipt_number)
         values ($1, 'contribution_credit', 'credit', 100000, $2, 'GGR-000000-999999')`,
        [m, attempt],
      ),
      UNIQUE_VIOLATION,
    );
  });

  it("refuses a credit for an attempt that is not successful", async () => {
    const m = await createMember();
    const attempt = await createAttempt(m, 100_000);
    await expectDbError(post(m, "contribution_credit", 100_000, { attempt }), gg("CONFLICT"));
    await setAttemptStatus(attempt, "processing");
    await expectDbError(post(m, "contribution_credit", 100_000, { attempt }), gg("CONFLICT"));
    expect(await ledgerCount(m)).toBe(0);
  });

  it("refuses a credit whose amount differs from the confirmed payment", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 100_000);
    const other = await createMember();
    const otherAttempt = await fundMember(other, 100_000);
    await expectDbError(post(m, "contribution_credit", 100_001, { attempt }), gg("CONFLICT"));
    // Someone else's payment cannot be credited to this member.
    await expectDbError(post(m, "contribution_credit", 100_000, { attempt: otherAttempt }), gg("CONFLICT"));
  });

  it("receipt numbers are unique", async () => {
    const m = await createMember();
    await fundMember(m, 10_000);
    await fundMember(m, 10_000);
    await fundMember(m, 10_000);
    const rows = await q<{ receipt_number: string }>("select receipt_number from ledger_entries where member_id = $1", [m]);
    expect(new Set(rows.map((r) => r.receipt_number)).size).toBe(3);
  });

  it.todo("a reversed payment (successful to reversed) removes its credit from the balance. The ledger has no entry type for it yet, see PR notes");
});

describe("I1: the ledger is append only", () => {
  it("update, delete and truncate are rejected, even for the table owner", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await expectDbError(q("update ledger_entries set amount_kobo = 1 where member_id = $1", [m]), gg("LEDGER_IMMUTABLE"));
    await expectDbError(q("delete from ledger_entries where member_id = $1", [m]), gg("LEDGER_IMMUTABLE"));
    await expectDbError(q("truncate ledger_entries"), gg("LEDGER_IMMUTABLE"));
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 0, available: 100_000 });
  });

  it("the server role has no update or delete privilege either (second control)", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await expectDbError(asRole("service_role", null, (c) => c.query("update ledger_entries set amount_kobo = 1")), PERMISSION_DENIED);
    await expectDbError(asRole("service_role", null, (c) => c.query("delete from ledger_entries")), PERMISSION_DENIED);
    await expectDbError(asRole("service_role", null, (c) => c.query("truncate ledger_entries")), PERMISSION_DENIED);
  });
});

describe("ledger entry constraints", () => {
  const insert = (m: string, type: string, direction: string, amount: number, reason: string | null = null) =>
    q(
      `insert into ledger_entries (member_id, entry_type, direction, amount_kobo, reason)
       values ($1, $2::ledger_entry_type, $3::ledger_direction, $4, $5)`,
      [m, type, direction, amount, reason],
    );

  it("direction must match the entry type", async () => {
    const m = await createMember();
    await expectDbError(insert(m, "adjustment_credit", "debit", 100, "wrong direction"), CHECK_VIOLATION);
    await expectDbError(insert(m, "adjustment_debit", "credit", 100, "wrong direction"), CHECK_VIOLATION);
  });

  it("amount must be positive and within the platform ceiling", async () => {
    const m = await createMember();
    await expectDbError(insert(m, "adjustment_credit", "credit", 0, "zero amount"), CHECK_VIOLATION);
    await expectDbError(insert(m, "adjustment_credit", "credit", -5, "negative amount"), CHECK_VIOLATION);
    await expectDbError(insert(m, "adjustment_credit", "credit", MAX_AMOUNT_KOBO + 1, "over the ceiling"), CHECK_VIOLATION);
    await insert(m, "adjustment_credit", "credit", MAX_AMOUNT_KOBO, "exactly the ceiling");
  });

  it("an adjustment must carry a reason of at least three characters", async () => {
    const m = await createMember();
    await expectDbError(insert(m, "adjustment_credit", "credit", 100, null), CHECK_VIOLATION);
    await expectDbError(insert(m, "adjustment_credit", "credit", 100, "ab"), CHECK_VIOLATION);
  });

  it("a contribution credit must reference a payment and carry a receipt", async () => {
    const m = await createMember();
    await expectDbError(insert(m, "contribution_credit", "credit", 100), CHECK_VIOLATION);
  });

  it("payout and refund entries must reference their payout or refund", async () => {
    const m = await createMember();
    await expectDbError(insert(m, "payout_debit", "debit", 100), CHECK_VIOLATION);
    await expectDbError(insert(m, "payout_reversal_credit", "credit", 100), CHECK_VIOLATION);
    await expectDbError(insert(m, "refund_debit", "debit", 100), CHECK_VIOLATION);
  });
});

describe("I2: balance is the sum of entries and never goes negative", () => {
  it("balance is credits minus debits", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await fundMember(m, 50_000);
    await post(m, "adjustment_debit", 30_000, { reason: "correction" });
    await post(m, "adjustment_credit", 5_000, { reason: "goodwill credit" });
    expect(await balanceOf(m)).toEqual({ ledger: 125_000, held: 0, available: 125_000 });
  });

  it("a debit larger than the balance is refused and posts nothing", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await expectDbError(post(m, "adjustment_debit", 100_001, { reason: "too much" }), gg("LEDGER_NEGATIVE_BALANCE"));
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 0, available: 100_000 });
  });

  it("a debit of exactly the balance is allowed and leaves zero", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await post(m, "adjustment_debit", 100_000, { reason: "clear the balance" });
    expect(await balanceOf(m)).toEqual({ ledger: 0, held: 0, available: 0 });
  });

  it("zero, negative and missing amounts are refused", async () => {
    const m = await createMember();
    await expectDbError(post(m, "adjustment_credit", 0, { reason: "nothing" }), gg("PAYMENT_AMOUNT_INVALID"));
    await expectDbError(post(m, "adjustment_credit", -1, { reason: "negative" }), gg("PAYMENT_AMOUNT_INVALID"));
  });

  it("a member without a ledger account cannot be posted to", async () => {
    await expectDbError(
      post("00000000-0000-4000-8000-000000000001", "adjustment_credit", 100, { reason: "unknown member" }),
      gg("NOT_FOUND"),
    );
  });

  it("two simultaneous debits cannot overdraw: the second waits for the first, then is refused", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const race = await raceWhileFirstIsOpen(
      "select * from ledger_post(p_member => $1::uuid, p_type => 'adjustment_debit', p_amount => 60000::bigint, p_reason => 'race')",
      [m],
    );
    expect(race.secondWasBlocked, "the second debit must wait on the member's ledger lock").toBe(true);
    expect(race.second).toEqual({ message: "LEDGER_NEGATIVE_BALANCE" });
    expect(await balanceOf(m)).toEqual({ ledger: 40_000, held: 0, available: 40_000 });
  });

  it("member_balance and my_balance agree with the ledger", async () => {
    const m = await createMember();
    await fundMember(m, 70_000);
    const direct = await one<{ b: string }>("select member_ledger_balance($1) as b", [m]);
    expect(Number(direct.b)).toBe(70_000);
    const mine = await asRole("authenticated", m, (c) => c.query("select * from my_balance()"));
    expect(mine.rows).toEqual([{ ledger_kobo: "70000", held_kobo: "0", available_kobo: "70000" }]);
  });
});
