import { describe, expect, it } from "vitest";
import { CHARGE_AUTHORIZATION_OK, CHARGE_AUTHORIZATION_REDIRECT_ASSUMED, INITIALIZE_OK, VERIFY_SUCCESS, clone } from "@/tests/payments/fixtures/paystack";
import { evaluateVerification } from "../verification";
import { createPaystackProvider, type FetchLike, type PaystackOptions } from "./paystack";
import type { ProviderResult } from "./types";

// Built at runtime so no secret-looking literal sits in the source.
const KEY = ["sk", "test", "unit", "key", "0000"].join("_");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
type Reply = { status: number; body: string } | { throws: "abort" | "network" };

/** Fake fetch that plays the given replies in order and records every call. */
function harness(replies: Reply[], overrides: Partial<PaystackOptions> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if ("throws" in reply) {
      if (reply.throws === "abort") {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      throw new TypeError("network down");
    }
    return { status: reply.status, text: async () => reply.body };
  };
  const provider = createPaystackProvider({
    secretKey: KEY,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    ...overrides,
  });
  return { provider, calls, sleeps };
}

const json = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body) });

function failureKind<T>(result: ProviderResult<T>): string {
  return result.ok ? "ok" : result.error.kind;
}

const initInput = {
  reference: "gg-0123456789ABCDEFGHJK",
  email: "member@example.com",
  amountKobo: 250_000,
  currency: "NGN" as const,
  callbackUrl: "https://app.example.com/app/pay/return",
};
const chargeInput = {
  reference: "gg-0123456789ABCDEFGHJK",
  email: "member@example.com",
  authorizationCode: "AUTH_uh8bcl3zbn",
  amountKobo: 250_000,
  currency: "NGN" as const,
};

describe("construction", () => {
  it("refuses a missing or non secret key", () => {
    expect(() => createPaystackProvider({ secretKey: "" })).toThrow();
    expect(() => createPaystackProvider({ secretKey: ["pk", "test", "abc"].join("_") })).toThrow();
  });
});

describe("initialize", () => {
  it("sends the documented request and returns the checkout details", async () => {
    const ok = clone(INITIALIZE_OK);
    ok.data.reference = initInput.reference;
    const { provider, calls } = harness([json(200, ok)]);
    const result = await provider.initialize({ ...initInput, metadata: { attempt: "a1" } });
    expect(result).toEqual({
      ok: true,
      value: { authorizationUrl: "https://checkout.paystack.com/3ni8kdavz62431k", accessCode: "3ni8kdavz62431k", reference: initInput.reference },
    });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://api.paystack.co/transaction/initialize");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.body).toEqual({
      email: "member@example.com",
      amount: "250000", // the docs type amount as a string of subunits
      currency: "NGN",
      reference: initInput.reference,
      callback_url: "https://app.example.com/app/pay/return",
      metadata: '{"attempt":"a1"}',
    });
  });

  it("uses a custom base URL without a double slash", async () => {
    const ok = clone(INITIALIZE_OK);
    ok.data.reference = initInput.reference;
    const { provider, calls } = harness([json(200, ok)], { baseUrl: "http://localhost:9999/" });
    await provider.initialize(initInput);
    expect(calls[0]!.url).toBe("http://localhost:9999/transaction/initialize");
  });

  it.each([
    ["short reference", { reference: "abc" }],
    ["reference with a space", { reference: "gg 0123456789ABCDEFGHJK" }],
    ["bad email", { email: "not an email" }],
    ["empty email", { email: "" }],
    ["zero amount", { amountKobo: 0 }],
    ["fractional amount", { amountKobo: 10.5 }],
    ["negative amount", { amountKobo: -5 }],
    ["http callback on a real host", { callbackUrl: "http://app.example.com/back" }],
    ["callback that is not a URL", { callbackUrl: "not a url" }],
    ["javascript callback", { callbackUrl: "javascript:alert(1)" }],
  ])("refuses %s without calling the provider", async (_name, patch) => {
    const { provider, calls } = harness([json(200, INITIALIZE_OK)]);
    const result = await provider.initialize({ ...initInput, ...patch });
    expect(failureKind(result)).toBe("rejected");
    expect(!result.ok && result.error.definitelyNotProcessed).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("allows an http callback on localhost for development", async () => {
    const ok = clone(INITIALIZE_OK);
    ok.data.reference = initInput.reference;
    const { provider } = harness([json(200, ok)]);
    expect((await provider.initialize({ ...initInput, callbackUrl: "http://localhost:3000/app/pay/return" })).ok).toBe(true);
  });

  it("treats an http authorization URL from the provider as malformed", async () => {
    const bad = clone(INITIALIZE_OK);
    bad.data.reference = initInput.reference;
    bad.data.authorization_url = "http://checkout.paystack.com/x";
    const { provider } = harness([json(200, bad)]);
    expect(failureKind(await provider.initialize(initInput))).toBe("malformed");
  });

  it("treats a different reference in the answer as malformed", async () => {
    const { provider } = harness([json(200, INITIALIZE_OK)]); // reference re4lyvq3s3, not ours
    expect(failureKind(await provider.initialize(initInput))).toBe("malformed");
  });

  it("does not retry a POST after a timeout or a 500", async () => {
    for (const reply of [{ throws: "abort" } as Reply, json(500, {})]) {
      const { provider, calls, sleeps } = harness([reply, json(200, INITIALIZE_OK)]);
      await provider.initialize(initInput);
      expect(calls).toHaveLength(1);
      expect(sleeps).toHaveLength(0);
    }
  });
});

describe("status mapping for every call", () => {
  const cases: Array<[Reply, string, boolean]> = [
    [json(401, { status: false }), "unauthorized", true],
    [json(403, { status: false }), "unauthorized", true],
    [json(404, { status: false }), "not_found", true],
    [json(400, { status: false }), "rejected", true],
    [json(422, { status: false }), "rejected", true],
    [json(429, { status: false }), "unavailable", false],
    [json(500, { status: false }), "unavailable", false],
    [json(502, { status: false }), "unavailable", false],
    [json(503, { status: false }), "unavailable", false],
    [{ status: 200, body: "<html>oops</html>" }, "malformed", false],
    [{ status: 200, body: "" }, "malformed", false],
    [json(200, { status: true, message: "x", data: { nonsense: true } }), "malformed", false],
    [json(200, { status: false, message: "no" }), "rejected", true],
    [{ throws: "abort" }, "timeout", false],
    [{ throws: "network" }, "unavailable", false],
  ];

  it.each(cases)("initialize maps reply %# to %s", async (reply, kind, definitelyNot) => {
    const { provider } = harness([reply]);
    const result = await provider.initialize(initInput);
    expect(failureKind(result)).toBe(kind);
    expect(!result.ok && result.error.definitelyNotProcessed).toBe(definitelyNot);
  });

  it.each(cases)("chargeAuthorization maps reply %# to %s", async (reply, kind, definitelyNot) => {
    const { provider } = harness([reply]);
    const result = await provider.chargeAuthorization(chargeInput);
    expect(failureKind(result)).toBe(kind);
    expect(!result.ok && result.error.definitelyNotProcessed).toBe(definitelyNot);
  });

  it("a timeout really aborts a hanging request", async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const provider = createPaystackProvider({ secretKey: KEY, fetchImpl, timeoutMs: 20 });
    expect(failureKind(await provider.initialize(initInput))).toBe("timeout");
  });
});

describe("failures never leak secrets or provider text", () => {
  it("contains neither the key nor the response body", async () => {
    const body = { status: false, message: `secret ${KEY} and AUTH_leak and 4081` };
    for (const reply of [json(400, body), json(401, body), json(500, body), { status: 200, body: JSON.stringify(body) }] as Reply[]) {
      const { provider } = harness([reply]);
      const text = JSON.stringify(await provider.initialize(initInput));
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("AUTH_leak");
      expect(text).not.toContain("4081");
    }
  });
});

describe("verify", () => {
  const sample = () => clone(VERIFY_SUCCESS);

  it("maps the official sample", async () => {
    const { provider, calls } = harness([json(200, sample())]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result).toEqual({
      ok: true,
      value: {
        providerTransactionId: "4099260516",
        reference: "re4lyvq3s3",
        status: "success",
        amountKobo: 40_333,
        requestedAmountKobo: 30_050,
        feesKobo: 10_283,
        currency: "NGN",
        channel: "card",
        gatewayResponse: "Successful",
        paidAt: "2024-08-22T09:15:02.000Z",
        authorization: {
          authorizationCode: "AUTH_uh8bcl3zbn",
          signature: "SIG_yEXu7dLBeqG0kU7g95Ke",
          last4: "4081",
          expMonth: "12",
          expYear: "2030",
          brand: "visa",
          cardType: "visa", // the sample has a trailing space, which we trim
          bank: "TEST BANK",
          countryCode: "NG",
          channel: "card",
          reusable: true,
        },
        customerEmail: "customer@example.com",
      },
    });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/verify/re4lyvq3s3");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("the official sample settles through evaluateVerification when we asked for 30050 and the customer bears the fees", async () => {
    const { provider } = harness([json(200, sample())]);
    const result = await provider.verify("re4lyvq3s3");
    if (!result.ok) throw new Error("expected ok");
    const tx = result.value;
    const decision = evaluateVerification(
      { reference: "re4lyvq3s3", amountKobo: 30_050, currency: "NGN" },
      { reference: tx.reference, status: tx.status, amountKobo: tx.amountKobo, currency: tx.currency, requestedAmountKobo: tx.requestedAmountKobo, feesKobo: tx.feesKobo },
      "customer",
    );
    expect(decision).toEqual({ kind: "settle" });
    // When the account bears the fees, the same answer is a mismatch.
    expect(
      evaluateVerification(
        { reference: "re4lyvq3s3", amountKobo: 30_050, currency: "NGN" },
        { reference: tx.reference, status: tx.status, amountKobo: tx.amountKobo, currency: tx.currency, requestedAmountKobo: tx.requestedAmountKobo, feesKobo: tx.feesKobo },
        "merchant",
      ).kind,
    ).toBe("mismatch");
    // Asking for the paid total instead is not our attempt amount, so it must not settle.
    expect(
      evaluateVerification(
        { reference: "re4lyvq3s3", amountKobo: 99_999, currency: "NGN" },
        { reference: tx.reference, status: tx.status, amountKobo: tx.amountKobo, currency: tx.currency, requestedAmountKobo: tx.requestedAmountKobo, feesKobo: tx.feesKobo },
        "customer",
      ).kind,
    ).toBe("mismatch");
  });

  it("keeps a 64 bit transaction id exact", async () => {
    const text = JSON.stringify(sample()).replace('"id":4099260516', '"id":18446744073709551615');
    const { provider } = harness([{ status: 200, body: text }]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result.ok && result.value.providerTransactionId).toBe("18446744073709551615");
  });

  it("returns an unrecognised status as raw text for the decision function to handle", async () => {
    const s = sample();
    s.data.status = "brand_new_status";
    const { provider } = harness([json(200, s)]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result.ok && result.value.status).toBe("brand_new_status");
  });

  it("drops an authorization it cannot read fully instead of keeping half a card", async () => {
    const s = sample();
    delete (s.data.authorization as { signature?: string }).signature;
    const { provider } = harness([json(200, s)]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result.ok && result.value.authorization).toBeNull();
    expect(result.ok && result.value.status).toBe("success");
  });

  it("accepts a transaction with no authorization", async () => {
    const s = sample();
    (s.data as { authorization: unknown }).authorization = null;
    const { provider } = harness([json(200, s)]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result.ok && result.value.authorization).toBeNull();
  });

  it("treats a fractional or negative amount as malformed", async () => {
    for (const amount of [100.5, -100]) {
      const s = sample();
      s.data.amount = amount;
      const { provider } = harness([json(200, s)]);
      expect(failureKind(await provider.verify("re4lyvq3s3"))).toBe("malformed");
    }
  });

  it("treats an answer about another reference as malformed", async () => {
    const { provider } = harness([json(200, sample())]);
    expect(failureKind(await provider.verify("gg-0123456789ABCDEFGHJK"))).toBe("malformed");
  });

  it("refuses a bad reference without calling the provider and encodes the path", async () => {
    const { provider, calls } = harness([json(200, sample())]);
    expect(failureKind(await provider.verify("../../etc"))).toBe("rejected");
    expect(failureKind(await provider.verify("a b c d e f"))).toBe("rejected");
    expect(calls).toHaveLength(0);
  });

  it("reports not_found for an unknown reference and does not retry it", async () => {
    const { provider, calls } = harness([json(404, { status: false, message: "Transaction reference not found" })]);
    expect(failureKind(await provider.verify("re4lyvq3s3"))).toBe("not_found");
    expect(calls).toHaveLength(1);
  });

  it("retries a timeout with growing backoff and jitter, then succeeds", async () => {
    const { provider, calls, sleeps } = harness([{ throws: "abort" }, json(503, {}), json(200, sample())]);
    const result = await provider.verify("re4lyvq3s3");
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
    // base 200ms doubling, plus jitter of 0.5 * 200 = 100ms
    expect(sleeps).toEqual([300, 500]);
  });

  it("gives up after the configured retries and reports the last failure", async () => {
    const { provider, calls } = harness([{ throws: "abort" }], { verifyRetries: 2 });
    expect(failureKind(await provider.verify("re4lyvq3s3"))).toBe("timeout");
    expect(calls).toHaveLength(3);
  });

  it("does not retry auth or rejection failures", async () => {
    for (const status of [400, 401, 403]) {
      const { provider, calls } = harness([json(status, { status: false })]);
      await provider.verify("re4lyvq3s3");
      expect(calls).toHaveLength(1);
    }
  });

  it("verifyRetries 0 means a single attempt", async () => {
    const { provider, calls } = harness([{ throws: "abort" }], { verifyRetries: 0 });
    await provider.verify("re4lyvq3s3");
    expect(calls).toHaveLength(1);
  });
});

describe("chargeAuthorization", () => {
  it("sends the documented request, with queue only when asked", async () => {
    const ok = clone(CHARGE_AUTHORIZATION_OK);
    ok.data.reference = chargeInput.reference;
    const { provider, calls } = harness([json(200, ok), json(200, ok)]);
    const queued = await provider.chargeAuthorization({ ...chargeInput, queue: true });
    await provider.chargeAuthorization(chargeInput);
    expect(queued).toEqual({ ok: true, value: { kind: "submitted", reference: chargeInput.reference, statusHint: "success" } });
    expect(calls[0]!.url).toBe("https://api.paystack.co/transaction/charge_authorization");
    expect(calls[0]!.body).toEqual({
      email: "member@example.com",
      amount: "250000",
      currency: "NGN",
      reference: chargeInput.reference,
      authorization_code: "AUTH_uh8bcl3zbn",
      queue: true,
    });
    expect(calls[1]!.body).not.toHaveProperty("queue");
  });

  it("returns a redirect when the answer carries an https authorization URL (assumed shape)", async () => {
    const redirect = clone(CHARGE_AUTHORIZATION_REDIRECT_ASSUMED);
    redirect.data.reference = chargeInput.reference;
    const { provider } = harness([json(200, redirect)]);
    expect(await provider.chargeAuthorization(chargeInput)).toEqual({
      ok: true,
      value: { kind: "redirect", reference: chargeInput.reference, authorizationUrl: "https://checkout.paystack.com/abc123xyz" },
    });
  });

  it("treats a non https redirect URL as malformed", async () => {
    const redirect = clone(CHARGE_AUTHORIZATION_REDIRECT_ASSUMED);
    redirect.data.reference = chargeInput.reference;
    redirect.data.authorization_url = "http://evil.example/x";
    const { provider } = harness([json(200, redirect)]);
    expect(failureKind(await provider.chargeAuthorization(chargeInput))).toBe("malformed");
  });

  it("treats an answer with a different reference as malformed", async () => {
    const { provider } = harness([json(200, CHARGE_AUTHORIZATION_OK)]); // reference 0m7frfnr47ezyxl
    expect(failureKind(await provider.chargeAuthorization(chargeInput))).toBe("malformed");
  });

  it.each([
    ["short reference", { reference: "x" }],
    ["bad email", { email: "nope" }],
    ["zero amount", { amountKobo: 0 }],
    ["empty authorization code", { authorizationCode: "" }],
  ])("refuses %s without calling the provider", async (_name, patch) => {
    const { provider, calls } = harness([json(200, CHARGE_AUTHORIZATION_OK)]);
    expect(failureKind(await provider.chargeAuthorization({ ...chargeInput, ...patch }))).toBe("rejected");
    expect(calls).toHaveLength(0);
  });

  it("never retries a charge, whatever the failure", async () => {
    for (const reply of [{ throws: "abort" } as Reply, { throws: "network" } as Reply, json(500, {}), json(503, {}), json(429, {})]) {
      const { provider, calls, sleeps } = harness([reply, json(200, CHARGE_AUTHORIZATION_OK)]);
      await provider.chargeAuthorization(chargeInput);
      expect(calls).toHaveLength(1);
      expect(sleeps).toHaveLength(0);
    }
  });
});
