import "server-only";
import { createPaystackProvider } from "./paystack";
import { providerFail, type PaymentProvider } from "./types";

/**
 * The provider for this deployment, built from server only environment variables.
 * If the key is missing or is not a secret key, every call fails as "unauthorized".
 * Services turn that into PAYMENT_PROVIDER_UNAVAILABLE, so a misconfigured deployment blocks
 * payments with a clear error and never pretends a payment went through.
 */
export function createPaymentProviderFromEnv(options: { timeoutMs?: number } = {}): PaymentProvider {
  const secretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  const baseUrl = process.env.PAYSTACK_BASE_URL || undefined;
  if (!secretKey.startsWith("sk_")) {
    return {
      initialize: async () => providerFail("unauthorized"),
      verify: async () => providerFail("unauthorized"),
      chargeAuthorization: async () => providerFail("unauthorized"),
    };
  }
  return createPaystackProvider({ secretKey, baseUrl, timeoutMs: options.timeoutMs });
}
