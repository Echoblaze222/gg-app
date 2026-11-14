/**
 * Decides what settlement does with a provider verify answer. Pure, no I/O.
 *
 * Invariant A2: credit only when the provider says success AND the reference, currency and amount
 * match the attempt we created. Anything else posts nothing.
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
  readonly amountKobo: number;
  readonly currency: string;
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

function matchMoney(expected: ExpectedPayment, actual: ProviderVerification): MismatchReason | null {
  if (actual.currency.toUpperCase() !== expected.currency) return "currency";
  if (!isKobo(actual.amountKobo) || actual.amountKobo !== expected.amountKobo) return "amount";
  return null;
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
