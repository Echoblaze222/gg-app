import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPaymentProviderFromEnv } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createPaymentProviderFromEnv", () => {
  it("fails every call as unauthorized when the key is missing", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    const provider = createPaymentProviderFromEnv();
    for (const result of [
      await provider.verify("re4lyvq3s3"),
      await provider.initialize({ reference: "gg-0123456789ABCDEFGHJK", email: "a@b.co", amountKobo: 100, currency: "NGN", callbackUrl: "https://a.example/x" }),
      await provider.chargeAuthorization({ reference: "gg-0123456789ABCDEFGHJK", email: "a@b.co", authorizationCode: "AUTH_x", amountKobo: 100, currency: "NGN" }),
    ]) {
      expect(!result.ok && result.error.kind).toBe("unauthorized");
    }
  });

  it("fails closed when the key is a public key", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", ["pk", "test", "x"].join("_"));
    expect((await createPaymentProviderFromEnv().verify("re4lyvq3s3")).ok).toBe(false);
  });

  it("builds a real provider for a secret key and honours the base URL override", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", ["sk", "test", "x"].join("_"));
    vi.stubEnv("PAYSTACK_BASE_URL", "http://127.0.0.1:1"); // nothing listens here
    const result = await createPaymentProviderFromEnv({ timeoutMs: 200 }).verify("re4lyvq3s3");
    expect(!result.ok && ["unavailable", "timeout"].includes(result.error.kind)).toBe(true);
  });
});
