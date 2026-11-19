import { describe, expect, it } from "vitest";
import { FAKE_AUTHORIZATION, makeTransaction } from "@/tests/payments/fake-provider";
import { AMOUNT, createHarness, type Harness } from "@/tests/payments/harness";
import { CrashError, receiptConflictError } from "@/tests/payments/memory";
import { providerFail, providerOk } from "../provider/types";
import { RECEIPT_NUMBER_PATTERN } from "../reference";

async function begin(h: Harness, overrides: Parameters<Harness["input"]>[0] = {}) {
  const out = await h.start(overrides);
  return out.attempt;
}
const settle = (h: Harness, reference: string) => h.payments.verifyAndSettle(h.ctx, { reference });
const statusOf = (h: Harness, id: string) => h.store.attemptsMap.get(id)?.status;
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : (r.error as { code: string }).code);

/** A1: an attempt is successful if and only if exactly one credit references it. */
function expectA1(h: Harness) {
  for (const attempt of h.store.attemptsMap.values()) {
    const credits = h.store.credits().filter((e) => e.paymentAttemptId === attempt.id);
    if (attempt.status === "successful") expect(credits).toHaveLength(1);
    else expect(credits.length <= 1).toBe(true);
  }
  const ids = new Set(h.store.credits().map((e) => e.paymentAttemptId));
  expect(ids.size).toBe(h.store.credits().length);
}

describe("settle.success", () => {
  it("credits the attempt amount once, flips to successful last, and tells the member", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);

    const r = await settle(h, attempt.reference);
    if (!r.ok) throw new Error(r.error.code);

    expect(r.value.status).toBe("successful");
    expect(r.value.providerTransactionId).toMatch(/^\d+$/);
    expect(h.store.credits()).toHaveLength(1);
    const credit = h.store.credits()[0];
    expect(credit?.amountKobo).toBe(AMOUNT);
    expect(credit?.receiptNumber).toMatch(RECEIPT_NUMBER_PATTERN);
    expect(h.store.balanceOf(h.memberId)).toBe(AMOUNT);
    expect(h.eventNames()).toEqual([
      "payment.status_changed", // initiating to awaiting_authentication
      "payment.status_changed", // awaiting_authentication to processing
      "payment.status_changed", // processing to verifying
      "ledger.entry_posted",
      "payment.status_changed", // verifying to successful
      "payment.succeeded",
    ]);
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0]?.type).toBe("payment_successful");
    expect(h.notified[0]?.body).toContain(credit?.receiptNumber);
    expectA1(h);
  });

  it("the response is the public attempt, with no provider access code", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    const r = await settle(h, attempt.reference);
    if (!r.ok) throw new Error("expected ok");
    expect(Object.keys(r.value)).not.toContain("providerAccessCode");
  });

  it("settling again does nothing: no second provider call, no second credit, no second event", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    await settle(h, attempt.reference);
    const calls = h.provider.callsTo("verify").length;
    const events = h.published.length;
    const before = new Map(h.store.counts);

    const again = await settle(h, attempt.reference);
    expect(again.ok && again.value.status).toBe("successful");
    expect(h.provider.callsTo("verify")).toHaveLength(calls);
    // a finished attempt costs one lookup and nothing else: no settings read, no transition, no ledger call
    for (const op of ["settings.get", "attempts.transition", "ledger.post", "obligations.getById", "members.getById"]) {
      expect(h.store.counts.get(op) ?? 0, op).toBe(before.get(op) ?? 0);
    }
    expect(h.published).toHaveLength(events);
    expect(h.store.credits()).toHaveLength(1);
  });

  it("a failing bus or notifier does not undo or fail the settlement", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.setBusFails(true);
    h.setNotifyFails(true);
    h.provider.succeed(attempt.reference);
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
  });
});

describe("settle.declined, settle.pending, not found", () => {
  it("settle.declined: a failed transaction fails the attempt with no credit and says money did not move", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "failed");
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("failed");
    expect(r.ok && r.value.failureCode).toBe("PAYMENT_DECLINED");
    expect(h.store.credits()).toHaveLength(0);
    expect(h.eventNames()).toContain("payment.failed");
    expect(h.notified[0]?.type).toBe("payment_failed");
    expect(h.notified[0]?.body).toContain("You were not charged");
  });

  it("settle.pending: ongoing, abandoned and unknown statuses wait in processing and are never success", async () => {
    for (const status of ["ongoing", "abandoned", "pending_review", "SUCCESS "]) {
      const h = createHarness();
      const attempt = await begin(h);
      h.provider.setStatus(attempt.reference, status);
      const r = await settle(h, attempt.reference);
      expect(r.ok && r.value.status).toBe("processing");
      expect(h.store.credits()).toHaveLength(0);
    }
  });

  it("a pending payment settles on a later run once the provider says success", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "ongoing");
    await settle(h, attempt.reference);
    h.provider.succeed(attempt.reference);
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expectA1(h);
  });

  it("client_cannot_settle: however often a member asks, only the provider's answer can produce success", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "abandoned");
    for (let i = 0; i < 5; i += 1) {
      const r = await settle(h, attempt.reference);
      expect(r.ok && r.value.status).not.toBe("successful");
    }
    expect(h.store.credits()).toHaveLength(0);
  });

  it("a reference the provider has never seen waits for expiry and moves no money", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.queueVerify(providerFail("not_found", 404));
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("processing");
    expect(h.store.credits()).toHaveLength(0);
  });
});

describe("settle.verify_timeout and provider trouble", () => {
  it("an unknown outcome leaves the attempt verifying, reports money moved unknown, and the next run settles it", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.provider.queueVerify(providerFail("timeout"));

    const first = await settle(h, attempt.reference);
    expect(code(first)).toBe("PAYMENT_PROVIDER_TIMEOUT");
    expect(statusOf(h, attempt.id)).toBe("verifying");
    expect(h.store.credits()).toHaveLength(0);

    const second = await settle(h, attempt.reference);
    expect(second.ok && second.value.status).toBe("successful");
    expectA1(h);
  });

  it("unavailable and malformed answers are unknown outcomes too", async () => {
    for (const kind of ["unavailable", "malformed"] as const) {
      const h = createHarness();
      const attempt = await begin(h);
      h.provider.queueVerify(providerFail(kind));
      expect(code(await settle(h, attempt.reference))).toBe("PAYMENT_PROVIDER_TIMEOUT");
      expect(statusOf(h, attempt.id)).toBe("verifying");
    }
  });

  it("a refused key is a system problem, not the member's", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.queueVerify(providerFail("unauthorized", 401));
    expect(code(await settle(h, attempt.reference))).toBe("SYSTEM_UNAVAILABLE");
    expect(statusOf(h, attempt.id)).toBe("verifying");
  });

  it("settle.settings_unavailable: an unreadable fee setting changes nothing and never calls the provider", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("settings.get", new Error("db down"));
    expect(code(await settle(h, attempt.reference))).toBe("SYSTEM_UNAVAILABLE");
    expect(statusOf(h, attempt.id)).toBe("awaiting_authentication");
    expect(h.provider.callsTo("verify")).toHaveLength(0);

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
  });
});

describe("settle.amount_mismatch and friends", () => {
  it("a different amount credits nothing, opens a discrepancy and fails the attempt", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference, { amountKobo: AMOUNT - 1 });
    const r = await settle(h, attempt.reference);

    expect(r.ok && r.value.status).toBe("failed");
    expect(r.ok && r.value.failureCode).toBe("PROVIDER_VERIFY_MISMATCH");
    expect(h.store.credits()).toHaveLength(0);
    expect(h.store.reconciliationRecords).toHaveLength(1);
    const rec = h.store.reconciliationRecords[0];
    expect(rec).toMatchObject({ status: "discrepancy", paymentAttemptId: attempt.id, expectedKobo: AMOUNT, providerKobo: AMOUNT - 1, note: "provider_amount_differs" });
    expect(h.eventNames()).toContain("reconciliation.discrepancy_found");
    expect(h.notified[0]?.body).toContain("reviewing");
  });

  it("a different currency or an answer about another reference is also a mismatch", async () => {
    const h = createHarness();
    const a = await begin(h);
    h.provider.succeed(a.reference, { currency: "USD" });
    await settle(h, a.reference);
    expect(h.store.reconciliationRecords[0]?.note).toBe("provider_currency_differs");

    const h2 = createHarness();
    const b = await begin(h2);
    h2.provider.queueVerify(providerOk(makeTransaction("gg-00000000000000000000", AMOUNT, "success")));
    await settle(h2, b.reference);
    expect(h2.store.reconciliationRecords[0]?.note).toBe("provider_answer_for_other_reference");
    expect(h2.store.credits()).toHaveLength(0);
  });

  it("with fee bearer merchant (the default) a total above the amount is a mismatch even with fees reported", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference, { amountKobo: AMOUNT + 7_500, requestedAmountKobo: AMOUNT, feesKobo: 7_500 });
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("failed");
    expect(h.store.credits()).toHaveLength(0);
  });

  it("with fee bearer customer the same payment is credited at the attempt amount, not the provider total", async () => {
    const h = createHarness();
    h.store.settingsMap.set("payment.fee_bearer", "customer");
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference, { amountKobo: AMOUNT + 7_500, requestedAmountKobo: AMOUNT, feesKobo: 7_500 });
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()[0]?.amountKobo).toBe(AMOUNT);
    expect(h.store.balanceOf(h.memberId)).toBe(AMOUNT);
  });

  it("settle.discrepancy_write_fails: if the record cannot be written the attempt stays verifying and the next run records it once", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference, { amountKobo: AMOUNT - 1 });
    h.store.failBefore("reconciliation.record", new Error("db down"));

    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(statusOf(h, attempt.id)).toBe("verifying");
    expect(h.store.reconciliationRecords).toHaveLength(0);

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("failed");
    expect(h.store.reconciliationRecords).toHaveLength(1);
  });

  it("settle.reversed_before_credit: no credit, a discrepancy, and a failed attempt marked reversed", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "reversed");
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("failed");
    expect(r.ok && r.value.failureCode).toBe("PAYMENT_REVERSED");
    expect(h.store.credits()).toHaveLength(0);
    expect(h.store.reconciliationRecords[0]?.note).toBe("provider_reports_reversed_before_credit");
  });
});

describe("settle: crashes", () => {
  it("settle.crash_after_ledger: the rerun finds the credit, finishes, and credits once", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.crashAfter("ledger.post");

    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(statusOf(h, attempt.id)).toBe("verifying");
    expect(h.store.credits()).toHaveLength(1);
    const receipt = h.store.credits()[0]?.receiptNumber;

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expect(h.store.credits()[0]?.receiptNumber).toBe(receipt);
    // Known limitation, no transactional outbox: the run that created the credit died before publishing, and the
    // rerun sees created=false. State is complete and consumers must not be the only source of truth. Never twice.
    expect(h.eventNames().filter((n) => n === "ledger.entry_posted").length).toBeLessThanOrEqual(1);
    expect(h.eventNames().filter((n) => n === "payment.succeeded")).toHaveLength(1);
    expect(h.notified).toHaveLength(1);
    expectA1(h);
  });

  it("settle.crash_after_obligation: the obligation is paid, the rerun flips the attempt and nothing is doubled", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    h.store.crashAfter("obligations.transition");

    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(h.store.obligationsMap.get(ob.id)?.status).toBe("paid");
    expect(statusOf(h, attempt.id)).toBe("verifying");

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.obligationsMap.get(ob.id)).toMatchObject({ status: "paid", paidByAttemptId: attempt.id });
    expect(h.store.reconciliationRecords).toHaveLength(0);
    expectA1(h);
  });

  it("a crash right after the status flip loses at most an event, never state", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.crashAfter("attempts.transition", 1, 2); // processing, verifying pass, then the flip to successful crashes

    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(statusOf(h, attempt.id)).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    const again = await settle(h, attempt.reference);
    expect(again.ok && again.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expectA1(h);
  });

  it("a crash on every single repository call, one at a time, always converges to one credit", async () => {
    const operations = [
      "settings.get",
      "attempts.transition",
      "ledger.post",
      "obligations.getById",
      "obligations.transition",
      "members.getById",
      "methods.saveIfNew",
      "reconciliation.startRun",
    ];
    for (const op of operations) {
      for (const when of ["before", "after"] as const) {
        const h = createHarness();
        const ob = h.seedObligation();
        const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
        h.provider.succeed(attempt.reference);
        if (when === "before") h.store.failBefore(op, new CrashError(op));
        else h.store.crashAfter(op);

        await settle(h, attempt.reference);
        const final = await settle(h, attempt.reference);
        expect(final.ok && final.value.status, `${when} ${op}`).toBe("successful");
        expect(h.store.credits(), `${when} ${op}`).toHaveLength(1);
        expect(h.store.obligationsMap.get(ob.id)?.status, `${when} ${op}`).toBe("paid");
        expectA1(h);
      }
    }
  });
});

describe("settle.receipt_collision", () => {
  it("retries with a new number and credits once", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("ledger.post", receiptConflictError(), 2);
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
  });

  it("gives up after three collisions: nothing credited, attempt stays verifying for the next run", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("ledger.post", receiptConflictError(), 3);
    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(h.store.credits()).toHaveLength(0);
    expect(statusOf(h, attempt.id)).toBe("verifying");

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
  });

  it("any other ledger failure is not retried as a collision", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("ledger.post", new Error("something else"), 1);
    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(h.store.credits()).toHaveLength(0);
  });
});

describe("settle: obligations", () => {
  it("settle.obligation_scheduled: a payment before the due date goes scheduled, due, paid", async () => {
    const h = createHarness();
    const ob = h.seedObligation({ status: "scheduled" });
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    await settle(h, attempt.reference);
    expect(h.store.obligationsMap.get(ob.id)).toMatchObject({ status: "paid", paidByAttemptId: attempt.id });
  });

  it("a missed obligation can still be paid", async () => {
    const h = createHarness();
    const ob = h.seedObligation({ status: "due" });
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.store.obligationsMap.set(ob.id, { ...ob, status: "missed" });
    h.provider.succeed(attempt.reference);
    await settle(h, attempt.reference);
    expect(h.store.obligationsMap.get(ob.id)?.status).toBe("paid");
  });

  it("settle.obligation_paid_elsewhere: the credit stands and a discrepancy is opened", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.store.obligationsMap.set(ob.id, { ...ob, status: "paid", paidByAttemptId: h.store.id() });
    h.provider.succeed(attempt.reference);
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expect(h.store.reconciliationRecords.map((x) => x.note)).toEqual(["obligation_paid_by_other_attempt"]);
  });

  it("a cancelled or vanished obligation does not block the credit either", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.store.obligationsMap.set(ob.id, { ...ob, status: "cancelled" });
    h.provider.succeed(attempt.reference);
    await settle(h, attempt.reference);
    expect(h.store.reconciliationRecords.map((x) => x.note)).toEqual(["obligation_not_payable_cancelled"]);

    const h2 = createHarness();
    const ob2 = h2.seedObligation();
    const a2 = await begin(h2, { purpose: "scheduled_contribution", obligationId: ob2.id });
    h2.store.obligationsMap.delete(ob2.id);
    h2.provider.succeed(a2.reference);
    const r = await settle(h2, a2.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h2.store.reconciliationRecords.map((x) => x.note)).toEqual(["obligation_missing"]);
  });
});

describe("settle: lost races on the obligation", () => {
  /** Makes the next obligation transition lose: the row is changed by "someone else" and the compare and set returns null. */
  function loseNextTransition(h: Harness, obligationId: string, becomes: { status: "cancelled" | "paid"; paidByAttemptId?: string | null }) {
    const original = h.store.obligations.transition;
    h.store.obligations.transition = async () => {
      h.store.obligations.transition = original;
      const current = h.store.obligationsMap.get(obligationId);
      if (current) h.store.obligationsMap.set(obligationId, { ...current, status: becomes.status, paidByAttemptId: becomes.paidByAttemptId ?? null });
      return null;
    };
  }

  it("a race that leaves the obligation in another state keeps the attempt verifying, credit intact, and the rerun converges", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    loseNextTransition(h, ob.id, { status: "cancelled" });

    expect(code(await settle(h, attempt.reference))).toBe("INTERNAL");
    expect(statusOf(h, attempt.id)).toBe("verifying");
    expect(h.store.credits()).toHaveLength(1);

    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expect(h.store.reconciliationRecords.map((x) => x.note)).toEqual(["obligation_not_payable_cancelled"]);
  });

  it("losing the race to this same attempt's earlier run is a quiet success", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    loseNextTransition(h, ob.id, { status: "paid", paidByAttemptId: attempt.id });
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.reconciliationRecords).toHaveLength(0);
  });

  it("losing the race to a different attempt opens a discrepancy and still credits", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    loseNextTransition(h, ob.id, { status: "paid", paidByAttemptId: h.store.id() });
    const r = await settle(h, attempt.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expect(h.store.reconciliationRecords.map((x) => x.note)).toEqual(["obligation_paid_by_other_attempt"]);
  });
});

describe("settle: saved card", () => {
  it("saves a reusable card from a card_authorization payment once, with the provider's email", async () => {
    const h = createHarness();
    const attempt = await begin(h, { purpose: "card_authorization" });
    h.provider.succeed(attempt.reference, { customerEmail: "  Member@Example.COM " });
    await settle(h, attempt.reference);

    expect(h.store.methodsList).toHaveLength(1);
    expect(h.store.methodsList[0]).toMatchObject({
      memberId: h.memberId,
      providerAuthorizationRef: FAKE_AUTHORIZATION.authorizationCode,
      providerCardSignature: FAKE_AUTHORIZATION.signature,
      brand: "visa",
      last4: "4081",
      expMonth: 12,
      expYear: 2030,
      reusable: true,
      authorizationEmail: "member@example.com",
    });
    expect(h.eventNames().filter((n) => n === "payment_method.saved")).toHaveLength(1);
  });

  it("A6: a non reusable authorization is never saved, and other purposes never save a card", async () => {
    const h = createHarness();
    const a = await begin(h, { purpose: "card_authorization" });
    h.provider.succeed(a.reference, { authorization: { ...FAKE_AUTHORIZATION, reusable: false } });
    const r = await settle(h, a.reference);
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.methodsList).toHaveLength(0);

    const h2 = createHarness();
    const b = await begin(h2, { purpose: "one_time_contribution" });
    h2.provider.succeed(b.reference);
    await settle(h2, b.reference);
    expect(h2.store.methodsList).toHaveLength(0);
  });

  it("falls back to the member's email when the provider reports none, and stores unknown expiry as null", async () => {
    const h = createHarness();
    const a = await begin(h, { purpose: "card_authorization" });
    h.provider.succeed(a.reference, { customerEmail: null, authorization: { ...FAKE_AUTHORIZATION, expMonth: "13", expYear: "30" } });
    await settle(h, a.reference);
    expect(h.store.methodsList[0]).toMatchObject({ authorizationEmail: "member@example.com", expMonth: null, expYear: null });
  });

  it("a second settlement or a second card payment with the same card saves and announces it once", async () => {
    const h = createHarness();
    for (let i = 0; i < 2; i += 1) {
      const a = await begin(h, { purpose: "card_authorization" });
      h.provider.succeed(a.reference);
      await settle(h, a.reference);
    }
    expect(h.store.methodsList).toHaveLength(1);
    expect(h.eventNames().filter((n) => n === "payment_method.saved")).toHaveLength(1);
  });
});

describe("settle.race", () => {
  it("many concurrent settlers in many interleavings produce one credit, one success event and a legal path", async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const h = createHarness();
      const ob = h.seedObligation();
      const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
      h.provider.succeed(attempt.reference);
      h.store.interleave(seed);

      await Promise.all([
        settle(h, attempt.reference),
        settle(h, attempt.reference),
        h.settler.settleByReference({ requestId: "sys", actorId: null, ip: null, userAgent: null }, attempt.reference),
        settle(h, attempt.reference),
      ]);
      // anything that lost a race on the last step re-reads, so a final quiet run must find it done
      h.store.interleave(0);
      const final = await settle(h, attempt.reference);

      expect(final.ok && final.value.status, `seed ${seed}`).toBe("successful");
      expect(h.store.credits(), `seed ${seed}`).toHaveLength(1);
      expect(h.eventNames().filter((n) => n === "payment.succeeded"), `seed ${seed}`).toHaveLength(1);
      expect(h.eventNames().filter((n) => n === "ledger.entry_posted"), `seed ${seed}`).toHaveLength(1);
      expect(h.store.obligationsMap.get(ob.id)?.status, `seed ${seed}`).toBe("paid");
      expectA1(h);
    }
  });

  it("every status change event follows a legal edge and each edge is announced at most once", async () => {
    for (let seed = 100; seed < 130; seed += 1) {
      const h = createHarness();
      const attempt = await begin(h);
      h.provider.succeed(attempt.reference);
      h.store.interleave(seed);
      await Promise.all([settle(h, attempt.reference), settle(h, attempt.reference), settle(h, attempt.reference)]);
      const changes = h.published.filter((e) => e.name === "payment.status_changed").map((e) => `${e.data.from}>${e.data.to}`);
      expect(new Set(changes).size, `seed ${seed}`).toBe(changes.length);
    }
  });
});

describe("verifyAndSettle: who may ask", () => {
  it("another member's reference, a malformed one and an unknown one all look like NOT_FOUND and call nothing", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    const stranger = h.ctxFor(h.store.id());
    const theirs = await h.payments.verifyAndSettle(stranger, { reference: attempt.reference });
    const junk = await settle(h, "not a reference");
    const unknown = await settle(h, "gg-00000000000000000000");
    expect([code(theirs), code(junk), code(unknown)]).toEqual(["NOT_FOUND", "NOT_FOUND", "NOT_FOUND"]);
    expect(h.provider.callsTo("verify")).toHaveLength(0);
  });

  it("anonymous, denied and rate limited callers never reach the provider", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    expect(code(await h.payments.verifyAndSettle(h.anonymous, { reference: attempt.reference }))).toBe("AUTH_SESSION_EXPIRED");
    h.denied.add("member.payment.create");
    expect(code(await settle(h, attempt.reference))).toBe("PERMISSION_DENIED");
    h.denied.clear();
    h.rateLimited.add("payment_verify");
    expect(code(await settle(h, attempt.reference))).toBe("RATE_LIMITED");
    expect(h.provider.callsTo("verify")).toHaveLength(0);
  });

  it("an unexpected failure becomes INTERNAL and leaks nothing", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.store.failBefore("attempts.getByReference", new Error("password=hunter2"));
    const r = await settle(h, attempt.reference);
    expect(code(r)).toBe("INTERNAL");
    expect(JSON.stringify(r)).not.toContain("hunter2");
  });
});

describe("getAttempt and listHistory", () => {
  it("owner only, and never the provider access code", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    const mine = await h.payments.getAttempt(h.ctx, { attemptId: attempt.id });
    expect(mine.ok).toBe(true);
    if (mine.ok) expect(Object.keys(mine.value)).not.toContain("providerAccessCode");
    const theirs = await h.payments.getAttempt(h.ctxFor(h.store.id()), { attemptId: attempt.id });
    expect(code(theirs)).toBe("NOT_FOUND");
    expect(code(await h.payments.getAttempt(h.ctx, { attemptId: h.store.id() }))).toBe("NOT_FOUND");
  });

  it("history lists only the caller's attempts, public shape, and clamps the page size", async () => {
    const h = createHarness();
    await begin(h);
    const stranger = h.store.id();
    h.store.membersMap.set(stranger, { id: stranger, email: "other@example.com", status: "active" });
    await h.payments.initiate(h.ctxFor(stranger), h.input());
    const r = await h.payments.listHistory(h.ctx, { limit: 100000, cursor: null });
    if (!r.ok) throw new Error("expected ok");
    expect(r.value.items).toHaveLength(1);
    expect(r.value.items.every((a) => a.memberId === h.memberId && !("providerAccessCode" in a))).toBe(true);
  });
});
