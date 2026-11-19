import { describe, expect, it } from "vitest";
import { providerFail, providerOk } from "../provider/types";
import { AMOUNT, MAX_KOBO, MIN_KOBO, createHarness } from "@/tests/payments/harness";

describe("initiate: happy path", () => {
  it("returns the checkout link, moves the attempt to awaiting_authentication and sends only what the provider needs", async () => {
    const h = createHarness();
    const out = await h.start();

    expect(out.attempt.status).toBe("awaiting_authentication");
    expect(out.authorizationUrl).toMatch(/^https:\/\/checkout\.paystack\.com\//);
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
    const call = h.provider.callsTo("initialize")[0];
    if (call?.method !== "initialize") throw new Error("expected initialize call");
    expect(call.input.email).toBe("member@example.com");
    expect(call.input.amountKobo).toBe(AMOUNT);
    expect(call.input.currency).toBe("NGN");
    expect(call.input.callbackUrl).toBe("https://gg.example.test/app/pay/return");
    expect(call.input.reference).toBe(out.attempt.reference);
    // metadata carries ids only, no personal data
    expect(call.input.metadata).toEqual({ attempt_id: out.attempt.id, purpose: "one_time_contribution" });
    expect(h.eventNames()).toEqual(["payment.status_changed"]);
  });

  it("no_secrets_in_responses: the attempt carries no provider access code, only the checkout link does", async () => {
    const h = createHarness();
    const out = await h.start();
    const stored = [...h.store.attemptsMap.values()][0];
    expect(stored?.providerAccessCode).toMatch(/^fake-/);
    expect(Object.keys(out.attempt)).not.toContain("providerAccessCode");
    expect(JSON.stringify(out.attempt)).not.toContain(stored?.providerAccessCode ?? "unreachable");
  });

  it("a failing event bus does not fail the payment", async () => {
    const h = createHarness();
    h.setBusFails(true);
    const out = await h.start();
    expect(out.attempt.status).toBe("awaiting_authentication");
    expect(h.logs.some((l) => l.event === "event.publish_failed")).toBe(true);
  });
});

describe("initiate.duplicate_tap and initiate.repeat_after_link", () => {
  it("same key returns the same attempt, calls the provider once and rebuilds the same link", async () => {
    const h = createHarness();
    const input = h.input();
    const first = await h.payments.initiate(h.ctx, input);
    const second = await h.payments.initiate(h.ctx, input);
    if (!first.ok || !second.ok) throw new Error("expected ok");

    expect(second.value.attempt.id).toBe(first.value.attempt.id);
    expect(second.value.authorizationUrl).toBe(first.value.authorizationUrl);
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
    expect(h.store.attemptsMap.size).toBe(1);
  });

  it("a repeat after the attempt moved on returns it without a link", async () => {
    const h = createHarness();
    const input = h.input();
    const first = await h.payments.initiate(h.ctx, input);
    if (!first.ok) throw new Error("expected ok");
    h.provider.succeed(first.value.attempt.reference);
    await h.payments.verifyAndSettle(h.ctx, { reference: first.value.attempt.reference });

    const again = await h.payments.initiate(h.ctx, input);
    if (!again.ok) throw new Error("expected ok");
    expect(again.value.attempt.status).toBe("successful");
    expect(again.value.authorizationUrl).toBeNull();
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
  });

  it("two simultaneous taps with one key create one attempt and one provider call", async () => {
    const h = createHarness();
    h.store.interleave(7);
    const input = h.input();
    const [a, b] = await Promise.all([h.payments.initiate(h.ctx, input), h.payments.initiate(h.ctx, input)]);
    expect(h.store.attemptsMap.size).toBe(1);
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
    const oks = [a, b].filter((r) => r.ok);
    const rest = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(rest.map((r) => (r.ok ? null : r.error.code))).toEqual(["PAYMENT_DUPLICATE_IN_PROGRESS"]);
  });
});

describe("initiate.key_reused", () => {
  it("same key with a different amount is IDEMPOTENCY_KEY_REUSED and nothing new is created", async () => {
    const h = createHarness();
    const first = h.input();
    await h.payments.initiate(h.ctx, first);
    const result = await h.payments.initiate(h.ctx, { ...first, amountKobo: AMOUNT + 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
  });

  it("the service checks the details itself when the repository does not", async () => {
    const h = createHarness();
    h.store.enforceKeyDetails = false;
    const first = h.input();
    await h.payments.initiate(h.ctx, first);
    for (const changed of [{ amountKobo: AMOUNT + 100 }, { purpose: "card_authorization" as const }, { channel: "ussd" as const }]) {
      const result = await h.payments.initiate(h.ctx, { ...first, ...changed });
      expect(result.ok ? "ok" : result.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    }
  });
});

describe("initiate.timeout, initiate.provider_down and refusals", () => {
  it("initiate.timeout: attempt stays initiating, money moved is unknown, no retry with any reference", async () => {
    const h = createHarness();
    h.provider.queueInitialize(providerFail("timeout"));
    const input = h.input();
    const result = await h.payments.initiate(h.ctx, input);
    expect(result.ok ? "ok" : result.error.code).toBe("PAYMENT_PROVIDER_TIMEOUT");
    expect([...h.store.attemptsMap.values()].map((a) => a.status)).toEqual(["initiating"]);

    const repeat = await h.payments.initiate(h.ctx, input);
    expect(repeat.ok ? "ok" : repeat.error.code).toBe("PAYMENT_DUPLICATE_IN_PROGRESS");
    expect(h.provider.callsTo("initialize")).toHaveLength(1); // charge.no_auto_retry for initialize
  });

  it("initiate.provider_down: an unavailable provider says so and still makes no second call", async () => {
    const h = createHarness();
    h.provider.queueInitialize(providerFail("unavailable", 503));
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect(h.provider.callsTo("initialize")).toHaveLength(1);
    expect([...h.store.attemptsMap.values()][0]?.status).toBe("initiating");
  });

  it("an unreadable provider answer is an unknown outcome, same as a timeout", async () => {
    const h = createHarness();
    h.provider.queueInitialize(providerFail("malformed", 200));
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("PAYMENT_PROVIDER_TIMEOUT");
  });

  it("a refusal fails the attempt for good and a new intent can start fresh", async () => {
    const h = createHarness();
    h.provider.queueInitialize(providerFail("rejected", 400));
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    const attempt = [...h.store.attemptsMap.values()][0];
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failureCode).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect(h.eventNames()).toEqual(["payment.status_changed", "payment.failed"]);

    const fresh = await h.payments.initiate(h.ctx, h.input());
    expect(fresh.ok).toBe(true);
  });
});

describe("initiate.foreign_checkout_host", () => {
  it("never redirects to a host outside the allowed list and fails the attempt", async () => {
    const h = createHarness();
    h.provider.queueInitialize(providerOk({ authorizationUrl: "https://checkout.paystack.com.evil.example/abc123", accessCode: "abc123", reference: "x" }));
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect([...h.store.attemptsMap.values()][0]?.status).toBe("failed");
  });

  it("rejects http, credentials in the URL and a custom port", async () => {
    for (const url of ["http://checkout.paystack.com/abc123", "https://user@checkout.paystack.com/abc123", "https://checkout.paystack.com:8443/abc123"]) {
      const h = createHarness();
      h.provider.queueInitialize(providerOk({ authorizationUrl: url, accessCode: "abc123", reference: "x" }));
      const result = await h.payments.initiate(h.ctx, h.input());
      expect(result.ok).toBe(false);
    }
  });

  it("the allowed hosts come from the setting, and a broken setting falls back to the default, never to open", async () => {
    const h = createHarness();
    h.store.settingsMap.set("payment.allowed_checkout_hosts", "checkout.other-pay.example");
    h.provider.queueInitialize(providerOk({ authorizationUrl: "https://checkout.paystack.com/abc123", accessCode: "abc123", reference: "x" }));
    expect((await h.payments.initiate(h.ctx, h.input())).ok).toBe(false);

    const h2 = createHarness();
    h2.store.settingsMap.set("payment.allowed_checkout_hosts", "[not json,,");
    h2.provider.queueInitialize(providerOk({ authorizationUrl: "https://evil.example/abc123", accessCode: "abc123", reference: "x" }));
    expect((await h2.payments.initiate(h2.ctx, h2.input())).ok).toBe(false);
  });
});

describe("initiate: limits fail closed", () => {
  it("a missing limit blocks the payment and creates nothing", async () => {
    const h = createHarness({ withoutLimits: true });
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("SYSTEM_UNAVAILABLE");
    expect(h.store.attemptsMap.size).toBe(0);
    expect(h.provider.calls).toHaveLength(0);
  });

  it("an unreadable, zero, negative or inverted limit also blocks", async () => {
    for (const [min, max] of [["abc", "100"], ["0", "100"], ["-5", "100"], ["500", "100"], ["1.5", "100"]]) {
      const h = createHarness();
      h.store.settingsMap.set("contribution.min_kobo", min as string);
      h.store.settingsMap.set("contribution.max_kobo", max as string);
      const result = await h.payments.initiate(h.ctx, h.input());
      expect(result.ok ? "ok" : result.error.code).toBe("SYSTEM_UNAVAILABLE");
    }
  });

  it("a failing settings read blocks the payment", async () => {
    const h = createHarness();
    h.store.failBefore("settings.get", new Error("db down"));
    const result = await h.payments.initiate(h.ctx, h.input());
    expect(result.ok ? "ok" : result.error.code).toBe("SYSTEM_UNAVAILABLE");
    expect(h.store.attemptsMap.size).toBe(0);
  });

  it("enforces the range on both ends, inclusive", async () => {
    const h = createHarness();
    for (const amountKobo of [MIN_KOBO - 1, MAX_KOBO + 1]) {
      const r = await h.payments.initiate(h.ctx, h.input({ amountKobo }));
      expect(r.ok ? "ok" : r.error.code).toBe("CONTRIBUTION_OUT_OF_RANGE");
    }
    for (const amountKobo of [MIN_KOBO, MAX_KOBO]) {
      expect((await h.payments.initiate(h.ctx, h.input({ amountKobo }))).ok).toBe(true);
    }
  });
});

describe("initiate: obligations", () => {
  it("initiate.not_owner: someone else's obligation looks exactly like a missing one", async () => {
    const h = createHarness();
    const other = h.store.id();
    const theirs = h.seedObligation({ memberId: other });
    const missing = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: h.store.id() }));
    const notMine = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: theirs.id }));
    expect(missing.ok ? "ok" : missing.error.code).toBe("NOT_FOUND");
    expect(notMine.ok ? "ok" : notMine.error.code).toBe("NOT_FOUND");
    expect(h.store.attemptsMap.size).toBe(0);
  });

  it("accepts due and scheduled obligations, with the exact amount", async () => {
    for (const status of ["due", "scheduled"] as const) {
      const h = createHarness();
      const ob = h.seedObligation({ status });
      const out = await h.start({ purpose: "scheduled_contribution", obligationId: ob.id });
      expect(out.attempt.obligationId).toBe(ob.id);
    }
  });

  it("rejects paid, missed, cancelled obligations and a wrong amount, naming the field", async () => {
    for (const status of ["paid", "missed", "cancelled"] as const) {
      const h = createHarness();
      const ob = h.seedObligation({ status });
      const r = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: ob.id }));
      expect(r.ok ? "ok" : r.error.code).toBe("VALIDATION_FAILED");
      if (!r.ok) expect(Object.keys(r.error.fields ?? {})).toEqual(["obligationId"]);
    }
    const h = createHarness();
    const ob = h.seedObligation();
    const r = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: ob.id, amountKobo: AMOUNT + 1 }));
    expect(r.ok ? "ok" : r.error.code).toBe("VALIDATION_FAILED");
    if (!r.ok) expect(Object.keys(r.error.fields ?? {})).toEqual(["amountKobo"]);
  });

  it("a scheduled contribution must name its obligation and a card authorization cannot carry one", async () => {
    const h = createHarness();
    const a = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution" }));
    expect(a.ok ? "ok" : a.error.code).toBe("VALIDATION_FAILED");
    const ob = h.seedObligation();
    const b = await h.payments.initiate(h.ctx, h.input({ purpose: "card_authorization", obligationId: ob.id }));
    expect(b.ok ? "ok" : b.error.code).toBe("VALIDATION_FAILED");
  });

  it("initiate.obligation_in_flight: a different key for a payment already in flight is a duplicate, the same key is not", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    const first = h.input({ purpose: "scheduled_contribution", obligationId: ob.id });
    expect((await h.payments.initiate(h.ctx, first)).ok).toBe(true);

    const second = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: ob.id }));
    expect(second.ok ? "ok" : second.error.code).toBe("PAYMENT_DUPLICATE_IN_PROGRESS");
    expect(h.store.attemptsMap.size).toBe(1);

    expect((await h.payments.initiate(h.ctx, first)).ok).toBe(true); // repeat of the same tap
  });

  it("a failed earlier attempt does not block a new key for the same obligation", async () => {
    const h = createHarness();
    const ob = h.seedObligation();
    h.provider.queueInitialize(providerFail("rejected", 400));
    await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: ob.id }));
    const retry = await h.payments.initiate(h.ctx, h.input({ purpose: "scheduled_contribution", obligationId: ob.id }));
    expect(retry.ok).toBe(true);
  });
});

describe("initiate: who may pay and what is not built yet", () => {
  it("anonymous, denied and rate limited callers get the right error and nothing is created", async () => {
    const h = createHarness();
    const anon = await h.payments.initiate(h.anonymous, h.input());
    expect(anon.ok ? "ok" : anon.error.code).toBe("AUTH_SESSION_EXPIRED");

    h.denied.add("member.payment.create");
    const denied = await h.payments.initiate(h.ctx, h.input());
    expect(denied.ok ? "ok" : denied.error.code).toBe("PERMISSION_DENIED");
    h.denied.clear();

    h.rateLimited.add("payment_initiate");
    const limited = await h.payments.initiate(h.ctx, h.input());
    expect(limited.ok ? "ok" : limited.error.code).toBe("RATE_LIMITED");
    expect(h.store.attemptsMap.size).toBe(0);
    expect(h.provider.calls).toHaveLength(0);
  });

  it("pending, suspended and closed members cannot start a payment", async () => {
    const expected = { pending_verification: "AUTH_EMAIL_NOT_VERIFIED", suspended: "AUTH_ACCOUNT_SUSPENDED", closed: "AUTH_ACCOUNT_SUSPENDED" } as const;
    for (const [status, code] of Object.entries(expected)) {
      const h = createHarness();
      const m = h.store.membersMap.get(h.memberId);
      if (!m) throw new Error("member missing");
      m.status = status as never;
      const r = await h.payments.initiate(h.ctx, h.input());
      expect(r.ok ? "ok" : r.error.code).toBe(code);
    }
  });

  it("saved cards and manual transfer are refused plainly, not faked", async () => {
    const h = createHarness();
    const card = await h.payments.initiate(h.ctx, h.input({ paymentMethodId: h.store.id() }));
    expect(card.ok ? "ok" : card.error.code).toBe("VALIDATION_FAILED");
    const manual = await h.payments.initiate(h.ctx, h.input({ channel: "manual_transfer" }));
    expect(manual.ok ? "ok" : manual.error.code).toBe("VALIDATION_FAILED");
    expect(h.provider.calls).toHaveLength(0);
  });

  it("invalid input names the fields and touches nothing", async () => {
    const h = createHarness();
    const r = await h.payments.initiate(h.ctx, { purpose: "one_time_contribution", amountKobo: 10.5, idempotencyKey: "short" });
    expect(r.ok ? "ok" : r.error.code).toBe("VALIDATION_FAILED");
    if (!r.ok) expect(Object.keys(r.error.fields ?? {}).sort()).toEqual(["amountKobo", "idempotencyKey"]);
    expect(h.store.attemptsMap.size).toBe(0);
  });

  it("an unexpected repository failure becomes INTERNAL with the request id, and the provider is never called", async () => {
    const h = createHarness();
    h.store.failBefore("attempts.createIdempotent", new Error("connection string postgres://secret"));
    const r = await h.payments.initiate(h.ctx, h.input());
    expect(r.ok ? "ok" : r.error.code).toBe("INTERNAL");
    if (!r.ok) {
      expect(r.error.reference).toBe(h.ctx.requestId);
      expect(JSON.stringify(r.error)).not.toContain("postgres");
    }
    expect(h.provider.calls).toHaveLength(0);
  });
});
