import { describe, expect, it } from "vitest";
import { FAKE_AUTHORIZATION, FakeProvider } from "@/tests/payments/fake-provider";
import { evaluateVerification } from "../verification";
import { providerFail, providerOk, type PaymentProvider } from "./types";

const REF = "gg-0123456789ABCDEFGHJK";
const init = { reference: REF, email: "member@example.com", amountKobo: 250_000, currency: "NGN" as const, callbackUrl: "https://app.example.com/app/pay/return" };

describe("FakeProvider behaves like the real thing where settlement depends on it", () => {
  it("is usable wherever a PaymentProvider is expected", () => {
    const provider: PaymentProvider = new FakeProvider();
    expect(typeof provider.verify).toBe("function");
  });

  it("an initialized but unpaid reference verifies as abandoned and never settles", async () => {
    const fake = new FakeProvider();
    const started = await fake.initialize(init);
    expect(started.ok && started.value.authorizationUrl.startsWith("https://checkout.paystack.com/")).toBe(true);
    const result = await fake.verify(REF);
    expect(result.ok && result.value.status).toBe("abandoned");
    if (!result.ok) throw new Error("expected ok");
    const decision = evaluateVerification(
      { reference: REF, amountKobo: 250_000, currency: "NGN" },
      { reference: result.value.reference, status: result.value.status, amountKobo: result.value.amountKobo, currency: result.value.currency },
    );
    expect(decision).toEqual({ kind: "wait", reason: "abandoned" });
  });

  it("succeed() makes the same reference settle, with a reusable card", async () => {
    const fake = new FakeProvider();
    await fake.initialize(init);
    fake.succeed(REF);
    const result = await fake.verify(REF);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.authorization).toEqual(FAKE_AUTHORIZATION);
    expect(
      evaluateVerification(
        { reference: REF, amountKobo: 250_000, currency: "NGN" },
        { reference: result.value.reference, status: result.value.status, amountKobo: result.value.amountKobo, currency: result.value.currency },
      ),
    ).toEqual({ kind: "settle" });
  });

  it("an unknown reference is not_found", async () => {
    const result = await new FakeProvider().verify("never-seen-ref");
    expect(!result.ok && result.error.kind).toBe("not_found");
  });

  it("a charge records a successful transaction and answers submitted", async () => {
    const fake = new FakeProvider();
    const out = await fake.chargeAuthorization({ reference: REF, email: "member@example.com", authorizationCode: "AUTH_x", amountKobo: 5_000, currency: "NGN" });
    expect(out).toEqual({ ok: true, value: { kind: "submitted", reference: REF, statusHint: "success" } });
    expect(fake.known(REF)?.status).toBe("success");
  });

  it("queued results win over defaults and are used once, in order", async () => {
    const fake = new FakeProvider();
    fake.queueVerify(providerFail("timeout")).queueVerify(providerOk(fake["transactions"].get(REF) ?? (await seed(fake))));
    expect((await fake.verify(REF)).ok).toBe(false);
    expect((await fake.verify(REF)).ok).toBe(true);
    // Queue empty again: falls back to the stored transaction.
    expect((await fake.verify(REF)).ok).toBe(true);
  });

  it("records every call in order", async () => {
    const fake = new FakeProvider();
    await fake.initialize(init);
    await fake.verify(REF);
    await fake.verify(REF);
    expect(fake.calls.map((c) => c.method)).toEqual(["initialize", "verify", "verify"]);
    expect(fake.callsTo("verify")).toHaveLength(2);
  });

  it("scripting an unknown reference throws, so a typo in a test cannot pass silently", () => {
    expect(() => new FakeProvider().succeed("nope")).toThrow("unknown reference");
    expect(() => new FakeProvider().setStatus("nope", "failed")).toThrow("unknown reference");
  });
});

async function seed(fake: FakeProvider) {
  await fake.initialize(init);
  const tx = fake.known(REF);
  if (!tx) throw new Error("seed failed");
  return tx;
}
