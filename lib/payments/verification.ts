/**
 * Decides what settlement does with a provider verify answer. Pure, no I/O.
 *
 * Invariant A2: credit only when the provider says success AND the reference, currency and amount
 * match the attempt we created (see amountMatches for the one allowed fee case). Anything else posts nothing.
 * Invariant A3: the input here comes from the verify endpoint, never from a webhook body or a client.
 * Any status we do not recognise is treated as "still in progress", never as success.
 */
import type { Currency, Kobo } from "@/contracts/enums";
import type { ErrorCode } from "@/contracts/errors";
import { isKobo } from "@/lib/ledger/money";

/** Transaction statuses documented by Paystack for the verify endpoint. */
export const PROVIDER_TX_STATUSES = ["success", "failed", "abandoned", "ongoing", "reversed"] as const;
export type ProviderTxStatus = (typeof PROVIDER_TX_STATUSES)[number];

export interface ExpectedPayment {
  readonly reference: string;
  readonly amountKobo: Kobo;
  readonly currency: Currency;
}

export interface ProviderVerification {
  readonly reference: string;
  /** Raw status text from the provider. Unrecognised values are handled safely. */
  readonly status: string;
  /** What the customer paid. Equals the requested amount plus fees when fees are passed to the customer. */
  readonly amountKobo: number;
  readonly currency: string;
  /** The amount we asked for, as the provider recorded it. Paystack returns it as `requested_amount`. */
  readonly requestedAmountKobo?: number | null;
  /** Provider fees. Only used to explain a customer paid total above the requested amount. */
  readonly feesKobo?: number | null;
}

export type MismatchReason = "reference" | "currency" | "amount";

export type VerificationDecision =
  | { readonly kind: "settle" }
  | { readonly kind: "fail"; readonly failureCode: ErrorCode }
  | { readonly kind: "wait"; readonly reason: "ongoing" | "abandoned" | "unknown_status" }
  | { readonly kind: "mismatch"; readonly reason: MismatchReason }
  | { readonly kind: "reversed" };

export function isProviderTxStatus(value: string): value is ProviderTxStatus {
  return (PROVIDER_TX_STATUSES as readonly string[]).includes(value);
}

/**
 * The amount is accepted in exactly two cases, both from provider data:
 * 1. the paid amount equals what we asked for, or
 * 2. the provider recorded our amount as the requested amount and the paid amount is that plus its
 *    own fees, which is what happens when fees are passed to the customer.
 * A higher total with no matching requested amount and fees is still a mismatch.
 * The ledger always credits the attempt amount, never the provider total.
 */
function amountMatches(expected: ExpectedPayment, actual: ProviderVerification): boolean {
  if (!isKobo(actual.amountKobo)) return false;
  if (actual.amountKobo === expected.amountKobo) return true;
  const { requestedAmountKobo, feesKobo } = actual;
  if (!isKobo(requestedAmountKobo) || !isKobo(feesKobo)) return false;
  return requestedAmountKobo === expected.amountKobo && actual.amountKobo === requestedAmountKobo + feesKobo;
}

function matchMoney(expected: ExpectedPayment, actual: ProviderVerification): MismatchReason | null {
  if (actual.currency.toUpperCase() !== expected.currency) return "currency";
  return amountMatches(expected, actual) ? null : "amount";
}

export function evaluateVerification(expected: ExpectedPayment, actual: ProviderVerification): VerificationDecision {
  // An answer about a different reference is never trusted, whatever status it carries.
  if (actual.reference !== expected.reference) return { kind: "mismatch", reason: "reference" };

  if (!isProviderTxStatus(actual.status)) return { kind: "wait", reason: "unknown_status" };

  switch (actual.status) {
    case "success": {
      const mismatch = matchMoney(expected, actual);
      return mismatch ? { kind: "mismatch", reason: mismatch } : { kind: "settle" };
    }
    case "reversed": {
      const mismatch = matchMoney(expected, actual);
      return mismatch ? { kind: "mismatch", reason: mismatch } : { kind: "reversed" };
    }
    case "failed":
      // Provider decline text is not mapped to finer codes until sandbox confirms the strings.
      return { kind: "fail", failureCode: "PAYMENT_DECLINED" };
    case "abandoned":
      return { kind: "wait", reason: "abandoned" };
    case "ongoing":
      return { kind: "wait", reason: "ongoing" };
  }
}
