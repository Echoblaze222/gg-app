import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AMOUNT, createHarness, type Harness } from "@/tests/payments/harness";
import { providerFail } from "../provider/types";
import { MAX_WEBHOOK_BYTES, deriveProviderEventId, sanitizeWebhook } from "./webhook";

async function begin(h: Harness, overrides: Parameters<Harness["input"]>[0] = {}) {
  return (await h.start(overrides)).attempt;
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : (r.error as { code: string }).code);
const outcome = (r: { ok: boolean; value?: { outcome: string } }) => (r.ok ? (r.value as { outcome: string }).outcome : "failed");

describe("webhook.forged", () => {
  it("a wrong, missing or wrong algorithm signature is 401 material: nothing stored, nothing settled, one security event", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    const body = h.chargeSuccessBody(attempt.reference);

    const sha256 = createHmac("sha256", "any-secret").update(body).digest("hex");
    for (const header of [null, "", "deadbeef", sha256, h.sign(body).toUpperCase().slice(0, -2) + "00"]) {
      const r = await h.receive(body, header);
      expect(code(r)).toBe("WEBHOOK_SIGNATURE_INVALID");
    }
    expect(h.store.eventsList).toHaveLength(0);
    expect(h.provider.callsTo("verify")).toHaveLength(0);
    expect(h.store.credits()).toHaveLength(0);
    expect(h.securityRecorded.length).toBe(5);
    expect(h.securityRecorded.every((e) => e.type === "webhook_signature_invalid")).toBe(true);
  });

  it("the signature covers the exact raw bytes: reformatting the body breaks it", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    const body = h.chargeSuccessBody(attempt.reference);
    const signature = h.sign(body);
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(code(await h.receive(reformatted, signature))).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(h.store.eventsList).toHaveLength(0);
  });

  it("webhook.forged_rate_limited: a flood still gets refused but stops writing security events", async () => {
    const h = createHarness();
    h.rateLimited.add("webhook_forged");
    for (let i = 0; i < 5; i += 1) expect(code(await h.receive("{}", "bad"))).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(h.securityRecorded).toHaveLength(0);
    expect(h.store.eventsList).toHaveLength(0);
  });

  it("refuses an oversized body before doing any work", async () => {
    const h = createHarness();
    const body = "x".repeat(MAX_WEBHOOK_BYTES + 1);
    expect(code(await h.receive(body))).toBe("PAYLOAD_TOO_LARGE");
    expect(h.securityRecorded).toHaveLength(0);
  });
});

describe("webhook: valid charge.success", () => {
  it("settles by reference through the provider, credits the attempt amount, and links the event", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);

    const r = await h.receive(h.chargeSuccessBody(attempt.reference));
    expect(outcome(r)).toBe("processed");
    expect(h.store.attemptsMap.get(attempt.id)?.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
    expect(h.store.eventsList).toHaveLength(1);
    expect(h.store.eventsList[0]).toMatchObject({ eventType: "charge.success", signatureValid: true, attemptId: attempt.id, processingError: null });
    expect(h.store.eventsList[0]?.processedAt).not.toBeNull();
    expect(h.eventNames()).toContain("webhook.received");
    expect(h.provider.callsTo("verify")).toHaveLength(1);
  });

  it("webhook.body_amount_ignored: the body says 123 kobo, the credit is the attempt amount and the provider decides", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    await h.receive(h.chargeSuccessBody(attempt.reference, { amount: 123, status: "failed" }));
    expect(h.store.credits()[0]?.amountKobo).toBe(AMOUNT);
  });

  it("a body that claims success while the provider says otherwise credits nothing", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "abandoned");
    await h.receive(h.chargeSuccessBody(attempt.reference));
    expect(h.store.credits()).toHaveLength(0);
    expect(h.store.attemptsMap.get(attempt.id)?.status).toBe("processing");
  });

  it("webhook.no_card_data_stored: no authorization code, signature, card or customer data reaches storage", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    await h.receive(h.chargeSuccessBody(attempt.reference, { metadata: { note: "AUTH_secret0001" }, ip_address: "198.51.100.9" }));
    const stored = JSON.stringify(h.store.eventsList[0]?.rawPayload);
    for (const secret of ["AUTH_secret0001", "SIG_secret0001", "4081", "408408", "CUS_x", "member@example.com", "198.51.100.9", "authorization", "customer"]) {
      expect(stored, secret).not.toContain(secret);
    }
    expect(stored).toContain(attempt.reference);
    expect(stored).toMatch(/"bodySha256":"[0-9a-f]{64}"/);
  });

  it("settle.callback_lost: the member never returns and the webhook alone completes the payment, saved card included", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const attempt = await begin(h, { purpose: "scheduled_contribution", obligationId: ob.id });
    h.provider.succeed(attempt.reference);
    await h.receive(h.chargeSuccessBody(attempt.reference));
    expect(h.store.obligationsMap.get(ob.id)?.status).toBe("paid");

    const h2 = createHarness();
    const card = await begin(h2, { purpose: "card_authorization" });
    h2.provider.succeed(card.reference);
    await h2.receive(h2.chargeSuccessBody(card.reference));
    expect(h2.store.methodsList).toHaveLength(1);
  });
});

describe("webhook.duplicate, webhook.replay, webhook.out_of_order", () => {
  it("webhook.duplicate: the same delivery twice is stored once, settled once, and answered as a duplicate", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    const body = h.chargeSuccessBody(attempt.reference);
    expect(outcome(await h.receive(body))).toBe("processed");
    const verifyCalls = h.provider.callsTo("verify").length;
    expect(outcome(await h.receive(body))).toBe("duplicate");
    expect(h.store.eventsList).toHaveLength(1);
    expect(h.store.credits()).toHaveLength(1);
    expect(h.provider.callsTo("verify")).toHaveLength(verifyCalls);
  });

  it("webhook.replay: a captured valid delivery replayed in many interleavings never double credits", async () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const h = createHarness();
      const attempt = await begin(h);
      h.provider.succeed(attempt.reference);
      const body = h.chargeSuccessBody(attempt.reference);
      h.store.interleave(seed);
      await Promise.all([h.receive(body), h.receive(body), h.receive(body), h.payments.verifyAndSettle(h.ctx, { reference: attempt.reference })]);
      h.store.interleave(0);
      expect(h.store.credits(), `seed ${seed}`).toHaveLength(1);
      expect(h.store.attemptsMap.get(attempt.id)?.status, `seed ${seed}`).toBe("successful");
      expect(h.eventNames().filter((n) => n === "payment.succeeded"), `seed ${seed}`).toHaveLength(1);
    }
  });

  it("webhook.out_of_order: a webhook before the member returns, then the return, ends in one credit", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    await h.receive(h.chargeSuccessBody(attempt.reference));
    const r = await h.payments.verifyAndSettle(h.ctx, { reference: attempt.reference });
    expect(r.ok && r.value.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
  });

  it("webhook.out_of_order: a stale success for a payment the provider now reports differently follows the provider", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.setStatus(attempt.reference, "ongoing");
    await h.receive(h.chargeSuccessBody(attempt.reference));
    expect(h.store.attemptsMap.get(attempt.id)?.status).toBe("processing");
    h.provider.succeed(attempt.reference);
    const body2 = h.chargeSuccessBody(attempt.reference, {}, 4099260517); // a later delivery with another id
    await h.receive(body2);
    expect(h.store.attemptsMap.get(attempt.id)?.status).toBe("successful");
    expect(h.store.credits()).toHaveLength(1);
  });

  it("webhook.duplicate_reprocesses_failed: a retry of a delivery that failed to process runs it again", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.provider.queueVerify(providerFail("timeout"));
    const body = h.chargeSuccessBody(attempt.reference);

    expect(outcome(await h.receive(body))).toBe("error");
    expect(h.store.eventsList[0]?.processingError).toBe("PAYMENT_PROVIDER_TIMEOUT");
    expect(h.store.credits()).toHaveLength(0);

    expect(outcome(await h.receive(body))).toBe("processed");
    expect(h.store.eventsList).toHaveLength(1);
    expect(h.store.eventsList[0]?.processingError).toBeNull();
    expect(h.store.credits()).toHaveLength(1);
  });

  it("a delivery that crashes mid processing leaves a stored, unfinished event that the next delivery finishes", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("ledger.post", new Error("db down"));
    const body = h.chargeSuccessBody(attempt.reference);
    expect(outcome(await h.receive(body))).toBe("error");
    expect(outcome(await h.receive(body))).toBe("processed");
    expect(h.store.credits()).toHaveLength(1);
  });
});

describe("webhook: other events and odd bodies", () => {
  it("a reference that is not ours is ignored and never sent to the provider", async () => {
    const h = createHarness();
    const r = await h.receive(h.chargeSuccessBody("someone-elses-ref-123"));
    expect(outcome(r)).toBe("processed");
    expect(h.provider.calls).toHaveLength(0);
    expect(h.store.counts.get("attempts.getByReference") ?? 0).toBe(0); // not even a database lookup for a reference we never issued
    expect(h.store.eventsList[0]?.processingError).toBeNull();
  });

  it("our reference format with no attempt is ignored and logged, not retried forever", async () => {
    const h = createHarness();
    const r = await h.receive(h.chargeSuccessBody("gg-00000000000000000000"));
    expect(outcome(r)).toBe("processed");
    expect(h.logs.some((l) => l.event === "webhook.unknown_attempt")).toBe(true);
    expect(h.provider.callsTo("verify")).toHaveLength(0);
  });

  it("a charge.success with no reference at all is ignored", async () => {
    const h = createHarness();
    const body = JSON.stringify({ event: "charge.success", data: { id: 1, status: "success" } });
    expect(outcome(await h.receive(body))).toBe("processed");
    expect(h.provider.calls).toHaveLength(0);
  });

  it("refund events are stored and left unprocessed for M5, other events are marked done with no action", async () => {
    const h = createHarness();
    const refund = JSON.stringify({ event: "refund.processed", data: { id: 77, status: "processed" } });
    expect(outcome(await h.receive(refund))).toBe("deferred");
    expect(h.store.eventsList[0]?.processedAt).toBeNull();

    for (const event of ["charge.dispute.create", "transfer.success", "invoice.update"]) {
      const body = JSON.stringify({ event, data: { id: 5, status: "x" } });
      expect(outcome(await h.receive(body))).toBe("processed");
    }
    expect(h.provider.calls).toHaveLength(0);
    expect(h.store.credits()).toHaveLength(0);
  });

  it("webhook.unparseable_body: a validly signed non JSON body is stored by hash, finished, and a repeat is a duplicate", async () => {
    const h = createHarness();
    expect(outcome(await h.receive("this is not json"))).toBe("processed");
    expect(h.store.eventsList[0]).toMatchObject({ eventType: "unparseable", processingError: null });
    expect(h.store.eventsList[0]?.processedAt).not.toBeNull();
    expect(outcome(await h.receive("this is not json"))).toBe("duplicate");
    for (const odd of ["[]", "null", JSON.stringify({ event: 5, data: {} }), JSON.stringify({ event: "charge.success", data: [] })]) {
      expect(outcome(await h.receive(odd))).toBe("processed");
    }
    expect(h.provider.calls).toHaveLength(0);
  });

  it("a storage failure answers an error so the provider retries, and settles nothing", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.store.failBefore("events.recordIfNew", new Error("db down"));
    expect(code(await h.receive(h.chargeSuccessBody(attempt.reference)))).toBe("INTERNAL");
    expect(h.store.credits()).toHaveLength(0);
    expect(outcome(await h.receive(h.chargeSuccessBody(attempt.reference)))).toBe("processed");
    expect(h.store.credits()).toHaveLength(1);
  });

  it("a failing bus does not fail the delivery", async () => {
    const h = createHarness();
    h.setBusFails(true);
    expect(outcome(await h.receive(JSON.stringify({ event: "invoice.update", data: { id: 1, status: "x" } })))).toBe("processed");
  });
});

describe("reprocessPending (the sweep)", () => {
  it("finishes events that errored, counts deferred ones, and never settles twice", async () => {
    const h = createHarness();
    const attempt = await begin(h);
    h.provider.succeed(attempt.reference);
    h.provider.queueVerify(providerFail("timeout"));
    await h.receive(h.chargeSuccessBody(attempt.reference));
    await h.receive(JSON.stringify({ event: "refund.pending", data: { id: 9, status: "pending" } }));

    const r = await h.webhooks.reprocessPending(h.anonymous);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value).toEqual({ examined: 2, processed: 1, deferred: 1, errored: 0 });
    expect(h.store.credits()).toHaveLength(1);

    const again = await h.webhooks.reprocessPending(h.anonymous);
    expect(again.ok && again.value).toEqual({ examined: 1, processed: 0, deferred: 1, errored: 0 });
    expect(h.store.credits()).toHaveLength(1);
  });

  it("is bounded by maxEvents and reports a storage failure instead of throwing", async () => {
    const h = createHarness();
    for (let i = 0; i < 5; i += 1) await h.receive(JSON.stringify({ event: "refund.pending", data: { id: i, status: "pending" } }));
    const r = await h.webhooks.reprocessPending(h.anonymous, { maxEvents: 2 });
    expect(r.ok && r.value.examined).toBe(2);

    h.store.failBefore("events.listUnprocessed", new Error("db down"));
    expect(code(await h.webhooks.reprocessPending(h.anonymous))).toBe("INTERNAL");
  });
});

describe("event id and sanitizing", () => {
  it("derives event:id:status, keeps 64 bit ids exact, and falls back to the body hash", () => {
    expect(deriveProviderEventId("charge.success", { id: 4099260516, status: "success" }, "h")).toBe("charge.success:4099260516:success");
    expect(deriveProviderEventId("charge.success", { id: "12345678901234567890", status: "success" }, "h")).toBe("charge.success:12345678901234567890:success");
    expect(deriveProviderEventId("charge.success", { id: 1 }, "hash-a")).toBe("hash-a");
    expect(deriveProviderEventId("charge.success", { status: "success" }, "hash-b")).toBe("hash-b");
    expect(deriveProviderEventId("e".repeat(100), { id: "x".repeat(150), status: "s" }, "hash-c")).toBe("hash-c");
  });

  it("a 64 bit transaction id survives parsing exactly (no float rounding in the dedupe key)", async () => {
    const h = createHarness();
    const body = `{"event":"invoice.update","data":{"id":12345678901234567890,"status":"ok"}}`;
    await h.receive(body);
    expect(h.store.eventsList[0]?.providerEventId).toBe("invoice.update:12345678901234567890:ok");
  });

  it("sanitizeWebhook keeps allowlisted scalars only and truncates long text", () => {
    const out = sanitizeWebhook("charge.success", { id: 1, reference: "r", amount: 5, authorization: { authorization_code: "x" }, customer: { email: "a@b.c" }, gateway_response: "g".repeat(500), unknown_future_field: "y", fees: null, paid_at: ["no"] }, "h");
    expect(out.data).toEqual({ id: 1, reference: "r", amount: 5, gateway_response: "g".repeat(200), fees: null });
    expect(out.bodySha256).toBe("h");
  });
});
