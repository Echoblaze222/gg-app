import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  UNIQUE_VIOLATION,
  balanceOf,
  closePool,
  createAttempt,
  createMember,
  createObligation,
  createPlan,
  expectDbError,
  fundMember,
  gg,
  ledgerCount,
  one,
  q,
  resetDatabase,
  setAttemptStatus,
  settleAttempt,
} from "./helpers";
import { MAX_AMOUNT_KOBO } from "@/contracts/schemas";

beforeAll(resetDatabase);
afterAll(closePool);

describe("I5: a duplicate user action cannot create a second charge", () => {
  it("the same member and idempotency key is rejected", async () => {
    const m = await createMember();
    await createAttempt(m, 10_000, { idempotencyKey: "idem_same_key_000001" });
    await expectDbError(createAttempt(m, 10_000, { idempotencyKey: "idem_same_key_000001" }), UNIQUE_VIOLATION);
  });

  it("the same key from a different member is a different request", async () => {
    const a = await createMember();
    const b = await createMember();
    await createAttempt(a, 10_000, { idempotencyKey: "idem_shared_key_00001" });
    await createAttempt(b, 10_000, { idempotencyKey: "idem_shared_key_00001" });
  });

  it("a payment reference is unique across all members", async () => {
    const a = await createMember();
    const b = await createMember();
    await createAttempt(a, 10_000, { reference: "ref_unique_reference_1" });
    await expectDbError(createAttempt(b, 10_000, { reference: "ref_unique_reference_1" }), UNIQUE_VIOLATION);
  });

  it("one provider transaction id can belong to only one attempt", async () => {
    const m = await createMember();
    const first = await createAttempt(m, 10_000);
    const second = await createAttempt(m, 10_000);
    await q("update payment_attempts set provider_transaction_id = 'txn_123456' where id = $1", [first]);
    await expectDbError(q("update payment_attempts set provider_transaction_id = 'txn_123456' where id = $1", [second]), UNIQUE_VIOLATION);
  });

  it("amount, reference and key are bounded", async () => {
    const m = await createMember();
    await expectDbError(createAttempt(m, 0), CHECK_VIOLATION);
    await expectDbError(createAttempt(m, -100), CHECK_VIOLATION);
    await expectDbError(createAttempt(m, MAX_AMOUNT_KOBO + 1), CHECK_VIOLATION);
    await expectDbError(createAttempt(m, 100, { reference: "short" }), CHECK_VIOLATION);
    await expectDbError(createAttempt(m, 100, { idempotencyKey: "tooshort" }), CHECK_VIOLATION);
  });
});

describe("payment attempt state machine is enforced by the database", () => {
  it("walks the legal path and stamps completed_at on a terminal state", async () => {
    const m = await createMember();
    const a = await createAttempt(m, 10_000);
    await setAttemptStatus(a, "awaiting_authentication");
    await setAttemptStatus(a, "processing");
    await setAttemptStatus(a, "verifying");
    const before = await one<{ completed_at: Date | null }>("select completed_at from payment_attempts where id = $1", [a]);
    expect(before.completed_at).toBeNull();
    await setAttemptStatus(a, "successful");
    const after = await one<{ completed_at: Date | null }>("select completed_at from payment_attempts where id = $1", [a]);
    expect(after.completed_at).not.toBeNull();
  });

  it("verifying may go back to processing (provider still pending)", async () => {
    const m = await createMember();
    const a = await createAttempt(m, 10_000);
    await setAttemptStatus(a, "processing");
    await setAttemptStatus(a, "verifying");
    await setAttemptStatus(a, "processing");
  });

  it.each([
    ["initiating", "successful"],
    ["initiating", "verifying"],
    ["processing", "successful"],
    ["processing", "cancelled"],
  ])("rejects %s -> %s", async (from, to) => {
    const m = await createMember();
    const a = await createAttempt(m, 10_000);
    if (from === "processing") await setAttemptStatus(a, "processing");
    await expectDbError(setAttemptStatus(a, to), gg("CONFLICT"));
    expect((await one<{ status: string }>("select status from payment_attempts where id = $1", [a])).status).toBe(from);
  });

  it.each(["failed", "cancelled", "expired"])("%s is final", async (final) => {
    const m = await createMember();
    const a = await createAttempt(m, 10_000);
    await setAttemptStatus(a, final);
    for (const next of ["initiating", "processing", "successful", "reversed"]) {
      await expectDbError(setAttemptStatus(a, next), gg("CONFLICT"));
    }
    expect(await ledgerCount(m)).toBe(0);
  });

  it("a successful payment can only go on to reversed, and reversed is final", async () => {
    const m = await createMember();
    const a = await fundMember(m, 10_000);
    await expectDbError(setAttemptStatus(a, "failed"), gg("CONFLICT"));
    await expectDbError(setAttemptStatus(a, "processing"), gg("CONFLICT"));
    await setAttemptStatus(a, "reversed");
    await expectDbError(setAttemptStatus(a, "successful"), gg("CONFLICT"));
  });

  it.each([
    ["amount_kobo", "amount_kobo + 1"],
    ["reference", "'ref_changed_reference_1'"],
    ["idempotency_key", "'idem_changed_key_000001'"],
    ["purpose", "'card_authorization'::payment_purpose"],
    ["created_at", "created_at - interval '1 day'"],
  ])("%s can never be changed after creation", async (column, expr) => {
    const m = await createMember();
    const a = await createAttempt(m, 10_000);
    await expectDbError(q(`update payment_attempts set ${column} = ${expr} where id = $1`, [a]), gg("CONFLICT"));
  });

  it("an attempt cannot be moved to another member", async () => {
    const a = await createMember();
    const b = await createMember();
    const attempt = await createAttempt(a, 10_000);
    await expectDbError(q("update payment_attempts set member_id = $2 where id = $1", [attempt, b]), gg("CONFLICT"));
  });

  it("a failed or cancelled payment never touches the ledger", async () => {
    const m = await createMember();
    const failed = await createAttempt(m, 10_000);
    await setAttemptStatus(failed, "failed");
    expect(await balanceOf(m)).toEqual({ ledger: 0, held: 0, available: 0 });
  });

  it.todo("a reversed payment takes its money back out of the ledger (see PR notes: not implemented in migration 1110)");
});

describe("I4: the same provider webhook is processed once", () => {
  const event = (id: string, provider = "paystack") =>
    q("insert into payment_events (provider, provider_event_id, event_type, raw_payload, signature_valid) values ($1, $2, 'charge.success', '{}'::jsonb, true)", [
      provider,
      id,
    ]);

  it("a duplicate delivery is rejected by the unique constraint", async () => {
    await event("evt_dup_1");
    await expectDbError(event("evt_dup_1"), UNIQUE_VIOLATION);
  });

  it("ON CONFLICT DO NOTHING lets the handler detect a replay without an error", async () => {
    const sql =
      "insert into payment_events (provider_event_id, event_type, raw_payload, signature_valid) values ('evt_replay_1', 'charge.success', '{}'::jsonb, true) on conflict (provider, provider_event_id) do nothing returning id";
    expect(await q(sql)).toHaveLength(1);
    expect(await q(sql)).toHaveLength(0);
  });

  it("only the paystack provider is accepted", async () => {
    await expectDbError(event("evt_other_1", "flutterwave"), CHECK_VIOLATION);
  });

  it("an event with an invalid signature can still be stored for the security log", async () => {
    await q("insert into payment_events (provider_event_id, event_type, raw_payload, signature_valid) values ('evt_badsig_1', 'charge.success', '{}'::jsonb, false)");
    const row = await one<{ signature_valid: boolean; processed_at: Date | null }>(
      "select signature_valid, processed_at from payment_events where provider_event_id = 'evt_badsig_1'",
    );
    expect(row).toEqual({ signature_valid: false, processed_at: null });
  });
});

describe("contribution obligations", () => {
  it("generation is idempotent: one obligation per plan per due date", async () => {
    const m = await createMember();
    const plan = await createPlan(m);
    await createObligation(plan, m, "2030-01-07");
    await expectDbError(createObligation(plan, m, "2030-01-07"), UNIQUE_VIOLATION);
    await createObligation(plan, m, "2030-01-14");
  });

  it("a successful payment marks its obligation paid and links the attempt", async () => {
    const m = await createMember();
    const plan = await createPlan(m, 50_000);
    const obligation = await createObligation(plan, m, "2030-02-01", 50_000);
    const attempt = await createAttempt(m, 50_000, { obligationId: obligation, purpose: "scheduled_contribution" });
    await settleAttempt(attempt);
    const row = await one<{ status: string; paid_by_attempt_id: string }>(
      "select status, paid_by_attempt_id from contribution_obligations where id = $1",
      [obligation],
    );
    expect(row).toEqual({ status: "paid", paid_by_attempt_id: attempt });
    expect(await balanceOf(m)).toEqual({ ledger: 50_000, held: 0, available: 50_000 });
  });

  it("a missed obligation can still be paid late", async () => {
    const m = await createMember();
    const plan = await createPlan(m);
    const obligation = await createObligation(plan, m, "2030-03-01");
    await q("update contribution_obligations set status = 'due' where id = $1", [obligation]);
    await q("update contribution_obligations set status = 'missed' where id = $1", [obligation]);
    const attempt = await createAttempt(m, 50_000, { obligationId: obligation });
    await settleAttempt(attempt);
    expect((await one<{ status: string }>("select status from contribution_obligations where id = $1", [obligation])).status).toBe("paid");
  });

  it("an obligation cannot be marked paid without a confirmed payment", async () => {
    const m = await createMember();
    const plan = await createPlan(m);
    const obligation = await createObligation(plan, m, "2030-04-01");
    await q("update contribution_obligations set status = 'due' where id = $1", [obligation]);
    await expectDbError(q("update contribution_obligations set status = 'paid' where id = $1", [obligation]), CHECK_VIOLATION);
  });

  it.each(["paid", "missed"])("a scheduled obligation cannot jump to %s", async (to) => {
    const m = await createMember();
    const plan = await createPlan(m);
    const obligation = await createObligation(plan, m, "2030-05-01");
    await expectDbError(q("update contribution_obligations set status = $2::obligation_status where id = $1", [obligation, to]), gg("CONFLICT"));
  });

  it("cancelled is final and the amount and due date are frozen", async () => {
    const m = await createMember();
    const plan = await createPlan(m);
    const obligation = await createObligation(plan, m, "2030-06-01");
    await expectDbError(q("update contribution_obligations set amount_kobo = 1 where id = $1", [obligation]), gg("CONFLICT"));
    await expectDbError(q("update contribution_obligations set due_on = '2030-06-02' where id = $1", [obligation]), gg("CONFLICT"));
    await q("update contribution_obligations set status = 'cancelled' where id = $1", [obligation]);
    await expectDbError(q("update contribution_obligations set status = 'due' where id = $1", [obligation]), gg("CONFLICT"));
  });
});

describe("contribution plans", () => {
  it("the owner and schedule of a plan never change, and a cancelled plan stays cancelled", async () => {
    const a = await createMember();
    const b = await createMember();
    const plan = await createPlan(a);
    await expectDbError(q("update contribution_plans set member_id = $2 where id = $1", [plan, b]), gg("CONFLICT"));
    await expectDbError(q("update contribution_plans set frequency = 'daily' where id = $1", [plan]), gg("CONFLICT"));
    await q("update contribution_plans set amount_kobo = 75000 where id = $1", [plan]);
    await q("update contribution_plans set status = 'paused' where id = $1", [plan]);
    await q("update contribution_plans set status = 'cancelled' where id = $1", [plan]);
    await expectDbError(q("update contribution_plans set status = 'active' where id = $1", [plan]), gg("PLAN_NOT_ACTIVE"));
  });

  it("the plan amount is bounded", async () => {
    const m = await createMember();
    await expectDbError(createPlan(m, 0), CHECK_VIOLATION);
    await expectDbError(createPlan(m, MAX_AMOUNT_KOBO + 1), CHECK_VIOLATION);
  });
});
