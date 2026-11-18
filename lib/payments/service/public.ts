import type { PaymentAttempt } from "@/contracts/entities";
import type { PaymentAttemptV11 } from "@/contracts/v1_1";

/**
 * What a member or screen may see. An explicit allowlist, so a field added to the stored attempt later
 * (like providerAccessCode, which is server side only) cannot leak by default.
 */
export function toPublicAttempt(a: PaymentAttemptV11): PaymentAttempt {
  return {
    id: a.id,
    memberId: a.memberId,
    purpose: a.purpose,
    channel: a.channel,
    amountKobo: a.amountKobo,
    currency: a.currency,
    status: a.status,
    reference: a.reference,
    idempotencyKey: a.idempotencyKey,
    obligationId: a.obligationId,
    paymentMethodId: a.paymentMethodId,
    providerTransactionId: a.providerTransactionId,
    failureCode: a.failureCode,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    completedAt: a.completedAt,
  };
}

export const DEFAULT_ALLOWED_CHECKOUT_HOSTS: readonly string[] = ["checkout.paystack.com"];

const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Reads the `payment.allowed_checkout_hosts` setting: a JSON array or a comma separated list of host names.
 * Anything missing, unreadable or empty gives the default, never an open list.
 */
export function parseAllowedHosts(raw: string | null): readonly string[] {
  if (raw === null || raw.trim() === "") return DEFAULT_ALLOWED_CHECKOUT_HOSTS;
  let items: unknown[];
  try {
    const parsed: unknown = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [raw];
  } catch {
    items = raw.split(",");
  }
  const hosts = items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => HOST_PATTERN.test(item));
  return hosts.length > 0 ? hosts : DEFAULT_ALLOWED_CHECKOUT_HOSTS;
}

/** https only, no credentials, no custom port, and an exact host from the allowed list. */
export function isAllowedCheckoutUrl(url: string, allowedHosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    allowedHosts.includes(parsed.hostname)
  );
}

const ACCESS_CODE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Rebuilds the hosted checkout link from the stored access code, so a repeated tap can send the member
 * back to the same checkout. Paystack's initialize sample shows the link is the checkout host plus the code.
 * Returns null for a code that does not look like one.
 */
export function checkoutUrlFor(accessCode: string | null, host: string = DEFAULT_ALLOWED_CHECKOUT_HOSTS[0] as string): string | null {
  if (accessCode === null || !ACCESS_CODE.test(accessCode)) return null;
  return `https://${host}/${accessCode}`;
}
