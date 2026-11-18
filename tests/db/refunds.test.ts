import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  balanceOf,
  closePool,
  createAttempt,
  createMember,
  createPayout,
  expectDbError,
  fundMember,
  gg,
  ledgerCount,
  one,
  q,
  resetDatabase,
  setAttemptStatus,
} from "./helpers";

beforeAll(resetDatabase);
afterAll(closePool);

let admin: string;
beforeAll(async () => {
  admin = await createMember({ name: "Owner Admin" });
});

const requestRefund = (member: string, attempt: string, amount: number) =>
  one<{ id: string }>(
    `insert into refunds (payment_attempt_id, member_id, amount_kobo, reason, requested_by)
     values ($1, $2, $3, 'Customer request', $4) returning id`,
    [attempt, member, amount, admin],
  ).then((r) => r.id);

const setStatus = (id: string, status: string, extra = "") =>
  q(`update refunds set status = $2::refund_status ${extra} where id = $1`, [id, status]);

async function advanceToProcessing(id: string) {
  await setStatus(id, "approved");
  await setStatus(id, "processing");
}

describe("refund eligibility", () => {
  it("only a successful payment can be refunded", async () => {
    const m = await createMember();
    const attempt = await createAttempt(m, 50_000);
    await expectDbError(requestRefund(m, attempt, 10_000), gg("CONFLICT"));
    await setAttemptStatus(attempt, "failed");
    await expectDbError(requestRefund(m, attempt, 10_000), gg("CONFLICT"));
  });

  it("the refund must belong to the member who paid", async () => {
    const payer = await createMember();
    const other = await createMember();
    const attempt = await fundMember(payer, 50_000);
    await expectDbError(requestRefund(other, attempt, 10_000), gg("CONFLICT"));
  });

  it("refunds together can never exceed the payment", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    await requestRefund(m, attempt, 30_000);
    await expectDbError(requestRefund(m, attempt, 30_000), gg("PAYMENT_AMOUNT_INVALID"));
    await requestRefund(m, attempt, 20_000);
    await expectDbError(requestRefund(m, attempt, 1), gg("PAYMENT_AMOUNT_INVALID"));
  });

  it("a rejected refund frees its share of the payment", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const first = await requestRefund(m, attempt, 50_000);
    await setStatus(first, "rejected");
    await requestRefund(m, attempt, 50_000);
  });

  it("a reason of at least three characters is required", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    await expectDbError(
      q("insert into refunds (payment_attempt_id, member_id, amount_kobo, reason, requested_by) values ($1, $2, 1000, 'no', $3)", [attempt, m, admin]),
      CHECK_VIOLATION,
    );
  });
});

describe("refund lifecycle and the ledger debit (D7)", () => {
  it("completing a refund posts exactly one debit", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const id = await requestRefund(m, attempt, 20_000);
    await advanceToProcessing(id);
    await setStatus(id, "completed", ", provider_refund_ref = 'rfd_0001'");
    expect(await ledgerCount(m, "refund_debit")).toBe(1);
    expect(await balanceOf(m)).toEqual({ ledger: 30_000, held: 0, available: 30_000 });
    expect((await one<{ resolved_at: Date | null }>("select resolved_at from refunds where id = $1", [id])).resolved_at).not.toBeNull();
  });

  it("completed requires the provider refund reference", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const id = await requestRefund(m, attempt, 20_000);
    await advanceToProcessing(id);
    await expectDbError(setStatus(id, "completed"), CHECK_VIOLATION);
  });

  it("a rejected or failed refund leaves the balance alone", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const rejected = await requestRefund(m, attempt, 10_000);
    await setStatus(rejected, "rejected");
    const failed = await requestRefund(m, attempt, 10_000);
    await advanceToProcessing(failed);
    await setStatus(failed, "failed");
    expect(await ledgerCount(m, "refund_debit")).toBe(0);
    expect(await balanceOf(m)).toEqual({ ledger: 50_000, held: 0, available: 50_000 });
  });

  it("cannot be completed when the member's available balance no longer covers it", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const refund = await requestRefund(m, attempt, 50_000);
    await advanceToProcessing(refund);
    // The member's whole balance is now held for a withdrawal.
    await createPayout(m, 50_000);
    await expectDbError(setStatus(refund, "completed", ", provider_refund_ref = 'rfd_0002'"), gg("LEDGER_NEGATIVE_BALANCE"));
    expect((await one<{ status: string }>("select status from refunds where id = $1", [refund])).status).toBe("processing");
    expect(await ledgerCount(m, "refund_debit")).toBe(0);
  });

  it("one provider refund reference cannot complete two refunds", async () => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const a = await requestRefund(m, attempt, 10_000);
    const b = await requestRefund(m, attempt, 10_000);
    await advanceToProcessing(a);
    await advanceToProcessing(b);
    await setStatus(a, "completed", ", provider_refund_ref = 'rfd_shared'");
    await expectDbError(setStatus(b, "completed", ", provider_refund_ref = 'rfd_shared'"), { code: "23505" });
  });

  it.each([
    ["requested", "processing"],
    ["requested", "completed"],
    ["approved", "completed"],
    ["processing", "approved"],
    ["processing", "rejected"],
  ])("rejects %s -> %s", async (from, to) => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const id = await requestRefund(m, attempt, 10_000);
    if (from !== "requested") await setStatus(id, "approved");
    if (from === "processing") await setStatus(id, "processing");
    await expectDbError(setStatus(id, to, to === "completed" ? ", provider_refund_ref = 'rfd_bad'" : ""), gg("CONFLICT"));
  });

  it.each(["completed", "rejected", "failed"])("%s is final", async (final) => {
    const m = await createMember();
    const attempt = await fundMember(m, 50_000);
    const id = await requestRefund(m, attempt, 10_000);
    if (final === "rejected") {
      await setStatus(id, "rejected");
    } else {
      await advanceToProcessing(id);
      await setStatus(id, final, final === "completed" ? ", provider_refund_ref = 'rfd_final'" : "");
    }
    for (const next of ["requested", "approved", "processing", "rejected"].filter((s) => s !== final)) {
      await expectDbError(setStatus(id, next), gg("CONFLICT"));
    }
  });

  it.each([
    ["amount_kobo", "amount_kobo + 1"],
    ["payment_attempt_id", "(select id from payment_attempts where id <> refunds.payment_attempt_id limit 1)"],
    ["requested_by", "(select id from members where id <> refunds.requested_by limit 1)"],
  ])("%s is frozen after the request", async (column, expr) => {
    const m = await createMember();
    await fundMember(await createMember(), 10_000);
    const attempt = await fundMember(m, 50_000);
    const id = await requestRefund(m, attempt, 10_000);
    await expectDbError(q(`update refunds set ${column} = ${expr} where id = $1`, [id]), gg("CONFLICT"));
  });
});
