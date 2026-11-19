/**
 * Property style test (no fast-check dependency yet, see the dependency handoff): for many seeds, mixed callers
 * (member return, webhook, sweep, repeated taps) run concurrently in random interleavings while random repository
 * calls fail or crash. Whatever happens, after the dust settles the money invariants must hold.
 */
import { describe, expect, it } from "vitest";
import { canPaymentTransition } from "../transitions";
import { createHarness } from "@/tests/payments/harness";
import { CrashError, seededRandom } from "@/tests/payments/memory";

const FAULTY_OPS = [
  "settings.get",
  "attempts.transition",
  "attempts.getByReference",
  "ledger.post",
  "obligations.getById",
  "obligations.transition",
  "methods.saveIfNew",
  "events.recordIfNew",
  "events.markProcessed",
  "reconciliation.record",
];

describe("money invariants under random interleavings and failures", () => {
  it("never double credits, never strands a payment, never breaks A1, and every event edge is legal", async () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const rand = seededRandom(seed * 7919);
      const h = createHarness();
      const ob = h.seedObligation();

      const paid = (await h.start({ purpose: "scheduled_contribution", obligationId: ob.id })).attempt;
      const card = (await h.start({ purpose: "card_authorization" })).attempt;
      const declined = (await h.start({ amountKobo: 700_000 })).attempt;
      h.provider.succeed(paid.reference);
      h.provider.succeed(card.reference);
      h.provider.setStatus(declined.reference, "failed");

      const bodies = [paid, card, declined].map((a) => h.chargeSuccessBody(a.reference, {}, 5_000_000_000 + seed));
      const operations: Array<() => Promise<unknown>> = [];
      for (const a of [paid, card, declined]) {
        operations.push(() => h.payments.verifyAndSettle(h.ctx, { reference: a.reference }));
        operations.push(() => h.settler.settleByReference(h.anonymous, a.reference));
      }
      for (const body of bodies) operations.push(() => h.receive(body));
      operations.push(() => h.webhooks.reprocessPending(h.anonymous));

      for (let n = 0; n < 4; n += 1) {
        const op = FAULTY_OPS[Math.floor(rand() * FAULTY_OPS.length)] as string;
        const skip = Math.floor(rand() * 3);
        if (rand() < 0.5) h.store.failBefore(op, new Error("injected"), 1, skip);
        else h.store.crashAfter(op, 1, skip);
      }
      h.store.interleave(seed);

      const picked = operations.filter(() => rand() < 0.8);
      const results = await Promise.allSettled(picked.map((run) => run()));
      // an injected crash may surface as a rejection from a collaborator, never as corrupted state
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(CrashError);

      // Recovery: calm store, the member returns and the sweep runs, as in production after an outage.
      h.store.quiet();
      for (let round = 0; round < 3; round += 1) {
        for (const a of [paid, card, declined]) await h.payments.verifyAndSettle(h.ctx, { reference: a.reference });
        await h.webhooks.reprocessPending(h.anonymous);
      }

      const tag = `seed ${seed}`;
      const status = (id: string) => h.store.attemptsMap.get(id)?.status;
      expect(status(paid.id), tag).toBe("successful");
      expect(status(card.id), tag).toBe("successful");
      expect(status(declined.id), tag).toBe("failed");

      // one credit per successful attempt, none for the failed one, A1 both ways
      const credits = h.store.credits();
      expect(credits.map((c) => c.paymentAttemptId).sort(), tag).toEqual([paid.id, card.id].sort());
      expect(h.store.balanceOf(h.memberId), tag).toBe(credits.reduce((sum, c) => sum + c.amountKobo, 0));
      expect(new Set(credits.map((c) => c.receiptNumber)).size, tag).toBe(credits.length);

      expect(h.store.obligationsMap.get(ob.id), tag).toMatchObject({ status: "paid", paidByAttemptId: paid.id });
      expect(h.store.methodsList, tag).toHaveLength(1);

      // events: each edge announced at most once per attempt, every edge legal
      const seen = new Set<string>();
      for (const e of h.published) {
        if (e.name !== "payment.status_changed") continue;
        expect(canPaymentTransition(e.data.from, e.data.to), `${tag} ${e.data.from}>${e.data.to}`).toBe(true);
        const key = `${e.data.attemptId}:${e.data.from}>${e.data.to}`;
        expect(seen.has(key), `${tag} duplicate ${key}`).toBe(false);
        seen.add(key);
      }
      expect(h.eventNames().filter((n) => n === "payment.succeeded").length, tag).toBeLessThanOrEqual(2);
    }
  });
});
