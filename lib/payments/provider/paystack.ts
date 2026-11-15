/**
 * Paystack implementation of PaymentProvider. Uses fetch only, no SDK.
 *
 * Rules (docs/payments/00-spec.md section 5.4):
 * - Explicit timeout on every call.
 * - POST calls are never retried automatically: a retry could charge twice. GET verify may retry.
 * - Every response is parsed with Zod. Anything unexpected is "malformed", never success.
 * - Failure text is fixed per kind. Response bodies, keys and card data never reach an error.
 * - The secret key is passed in. This file reads no environment, so it has no secret of its own.
 */
import type { ZodType } from "zod";
import { parseProviderJson } from "./json";
import { chargeData, envelope, initializeData, transactionData } from "./paystack-schemas";
import {
  providerFail,
  providerOk,
  type ChargeAuthorizationInput,
  type ChargeOutcome,
  type InitializeInput,
  type InitializeResult,
  type PaymentProvider,
  type ProviderAuthorization,
  type ProviderResult,
  type ProviderTransaction,
} from "./types";

export const PAYSTACK_DEFAULT_BASE_URL = "https://api.paystack.co";

/** The part of fetch we use, so tests can supply a small fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface PaystackOptions {
  /** Secret key. Test key outside production. Never logged, never put in an error. */
  readonly secretKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Extra attempts for GET verify after a timeout or unavailable answer. Default 2. */
  readonly verifyRetries?: number;
  readonly fetchImpl?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Random number in [0, 1) for retry jitter. */
  readonly random?: () => number;
}

/** Paystack accepts letters, digits, "-", "." and "=" in a reference. */
const PROVIDER_REFERENCE = /^[A-Za-z0-9.=-]{6,100}$/;
const RETRY_BASE_MS = 200;
const DEFAULT_TIMEOUT_MS = 10_000;

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeCallbackUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url.toString() : null;
  } catch {
    return null;
  }
}

function looksLikeEmail(value: string): boolean {
  return value.length > 0 && value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value);
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function createPaystackProvider(options: PaystackOptions): PaymentProvider {
  if (!options.secretKey.startsWith("sk_")) throw new Error("Paystack secret key is missing or not a secret key");
  const baseUrl = (options.baseUrl ?? PAYSTACK_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const verifyRetries = options.verifyRetries ?? 2;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;

  /** One HTTP call. Returns the parsed `data` of a successful envelope, or a typed failure. */
  async function call<T>(method: "GET" | "POST", path: string, schema: ZodType<T>, body?: unknown): Promise<ProviderResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number;
    let text: string;
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      return providerFail(isAbort(error) ? "timeout" : "unavailable");
    } finally {
      clearTimeout(timer);
    }

    if (status === 401 || status === 403) return providerFail("unauthorized", status);
    if (status === 404) return providerFail("not_found", status);
    if (status === 429 || status >= 500) return providerFail("unavailable", status);
    if (status < 200 || status >= 300) return providerFail("rejected", status);

    const parsed = envelope.safeParse(parseProviderJson(text));
    if (!parsed.success) return providerFail("malformed", status);
    if (!parsed.data.status) return providerFail("rejected", status);
    const data = schema.safeParse(parsed.data.data);
    return data.success ? providerOk(data.data) : providerFail("malformed", status);
  }

  return {
    async initialize(input: InitializeInput): Promise<ProviderResult<InitializeResult>> {
      const callbackUrl = safeCallbackUrl(input.callbackUrl);
      if (!PROVIDER_REFERENCE.test(input.reference) || !looksLikeEmail(input.email) || !validAmount(input.amountKobo) || callbackUrl === null) {
        return providerFail("rejected");
      }
      const result = await call("POST", "/transaction/initialize", initializeData, {
        email: input.email,
        amount: String(input.amountKobo),
        currency: input.currency,
        reference: input.reference,
        callback_url: callbackUrl,
        ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {}),
      });
      if (!result.ok) return result;
      const url = safeHttpsUrl(result.value.authorization_url);
      if (url === null || result.value.reference !== input.reference) return providerFail("malformed");
      return providerOk({ authorizationUrl: url, accessCode: result.value.access_code, reference: result.value.reference });
    },

    async verify(reference: string): Promise<ProviderResult<ProviderTransaction>> {
      if (!PROVIDER_REFERENCE.test(reference)) return providerFail("rejected");
      let result: ProviderResult<ReturnType<typeof transactionData.parse>> = providerFail("unavailable");
      for (let attempt = 0; attempt <= verifyRetries; attempt += 1) {
        result = await call("GET", `/transaction/verify/${encodeURIComponent(reference)}`, transactionData);
        const retryable = !result.ok && (result.error.kind === "timeout" || result.error.kind === "unavailable");
        if (!retryable || attempt === verifyRetries) break;
        await sleep(RETRY_BASE_MS * 2 ** attempt + Math.floor(random() * RETRY_BASE_MS));
      }
      if (!result.ok) return result;
      const tx = result.value;
      if (tx.reference !== reference) return providerFail("malformed");
      const auth = tx.authorization;
      const authorization: ProviderAuthorization | null = auth
        ? {
            authorizationCode: auth.authorization_code,
            signature: auth.signature,
            last4: auth.last4 ?? null,
            expMonth: auth.exp_month ?? null,
            expYear: auth.exp_year ?? null,
            brand: auth.brand ?? null,
            cardType: auth.card_type?.trim() ?? null,
            bank: auth.bank ?? null,
            countryCode: auth.country_code ?? null,
            channel: auth.channel ?? null,
            reusable: auth.reusable,
          }
        : null;
      return providerOk({
        providerTransactionId: tx.id,
        reference: tx.reference,
        status: tx.status,
        amountKobo: tx.amount,
        requestedAmountKobo: tx.requested_amount ?? null,
        feesKobo: tx.fees ?? null,
        currency: tx.currency,
        channel: tx.channel ?? null,
        gatewayResponse: tx.gateway_response ?? null,
        paidAt: tx.paid_at ?? null,
        authorization,
        customerEmail: tx.customer?.email ?? null,
      });
    },

    async chargeAuthorization(input: ChargeAuthorizationInput): Promise<ProviderResult<ChargeOutcome>> {
      if (
        !PROVIDER_REFERENCE.test(input.reference) ||
        !looksLikeEmail(input.email) ||
        !validAmount(input.amountKobo) ||
        input.authorizationCode.length === 0
      ) {
        return providerFail("rejected");
      }
      // No retry here, ever. A repeat of this POST with a new reference could charge the member twice.
      const result = await call("POST", "/transaction/charge_authorization", chargeData, {
        email: input.email,
        amount: String(input.amountKobo),
        currency: input.currency,
        reference: input.reference,
        authorization_code: input.authorizationCode,
        ...(input.queue ? { queue: true } : {}),
      });
      if (!result.ok) return result;
      if (result.value.reference !== input.reference) return providerFail("malformed");
      const redirect = result.value.authorization_url ? safeHttpsUrl(result.value.authorization_url) : null;
      if (result.value.authorization_url && redirect === null) return providerFail("malformed");
      return providerOk(
        redirect !== null
          ? { kind: "redirect", reference: input.reference, authorizationUrl: redirect }
          : { kind: "submitted", reference: input.reference, statusHint: result.value.status ?? null },
      );
    },
  };
}
