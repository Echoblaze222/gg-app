/**
 * The boundary between our payment code and a payment provider.
 * Services depend on this interface only. Paystack is one implementation (paystack.ts).
 * Nothing here throws for expected provider trouble: every call returns a ProviderResult.
 */
import type { Currency } from "@/contracts/enums";

export type ProviderFailureKind =
  /** The call did not finish in time. The provider may or may not have processed it. */
  | "timeout"
  /** Network failure, 5xx or rate limit. The provider may or may not have processed it. */
  | "unavailable"
  /** Our key was refused. A configuration problem, never shown to a member. */
  | "unauthorized"
  /** The provider understood the request and refused it. Nothing was processed. */
  | "rejected"
  /** The provider has no record of the reference. */
  | "not_found"
  /** The answer was not valid JSON or did not match the documented shape. Outcome unknown. */
  | "malformed";

export interface ProviderFailure {
  readonly kind: ProviderFailureKind;
  /** Fixed text per kind. Never contains provider body text, keys or card data. */
  readonly message: string;
  readonly httpStatus: number | null;
  /**
   * True only when the provider definitely did not process the request (it refused it).
   * False means money may have moved, so callers must verify by reference before concluding anything.
   */
  readonly definitelyNotProcessed: boolean;
}

export type ProviderResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ProviderFailure };

export interface InitializeInput {
  readonly reference: string;
  readonly email: string;
  readonly amountKobo: number;
  readonly currency: Currency;
  /** Where the provider sends the member after the hosted page. Must be https (http only for localhost). */
  readonly callbackUrl: string;
  /** Small string map for the provider dashboard. No personal data. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface InitializeResult {
  readonly authorizationUrl: string;
  readonly accessCode: string;
  readonly reference: string;
}

export interface ProviderAuthorization {
  readonly authorizationCode: string;
  readonly signature: string;
  readonly last4: string | null;
  readonly expMonth: string | null;
  readonly expYear: string | null;
  readonly brand: string | null;
  readonly cardType: string | null;
  readonly bank: string | null;
  readonly countryCode: string | null;
  readonly channel: string | null;
  readonly reusable: boolean;
}

/** A transaction as the provider reports it. Provider transaction ids are unsigned 64 bit, so kept as text. */
export interface ProviderTransaction {
  readonly providerTransactionId: string;
  readonly reference: string;
  /** Raw provider status. Decide with evaluateVerification, never by comparing strings elsewhere. */
  readonly status: string;
  readonly amountKobo: number;
  readonly requestedAmountKobo: number | null;
  readonly feesKobo: number | null;
  readonly currency: string;
  readonly channel: string | null;
  readonly gatewayResponse: string | null;
  readonly paidAt: string | null;
  readonly authorization: ProviderAuthorization | null;
  readonly customerEmail: string | null;
}

export interface ChargeAuthorizationInput {
  readonly reference: string;
  readonly email: string;
  readonly authorizationCode: string;
  readonly amountKobo: number;
  readonly currency: Currency;
  /** Ask the provider to queue the charge. Recommended for scheduled batches. */
  readonly queue?: boolean;
}

/**
 * What a charge call tells us. Neither case proves money moved:
 * settlement always follows with verify by reference (invariant A3).
 */
export type ChargeOutcome =
  /** The bank wants the member to approve. Send them to this URL. */
  | { readonly kind: "redirect"; readonly reference: string; readonly authorizationUrl: string }
  /** The provider accepted the call. `statusHint` is informational only. */
  | { readonly kind: "submitted"; readonly reference: string; readonly statusHint: string | null };

export interface PaymentProvider {
  initialize(input: InitializeInput): Promise<ProviderResult<InitializeResult>>;
  verify(reference: string): Promise<ProviderResult<ProviderTransaction>>;
  chargeAuthorization(input: ChargeAuthorizationInput): Promise<ProviderResult<ChargeOutcome>>;
}

export function providerOk<T>(value: T): ProviderResult<T> {
  return { ok: true, value };
}

const FAILURE_TEXT: Record<ProviderFailureKind, string> = {
  timeout: "The payment provider did not answer in time.",
  unavailable: "The payment provider is unavailable.",
  unauthorized: "The payment provider refused our credentials.",
  rejected: "The payment provider refused the request.",
  not_found: "The payment provider has no record of that reference.",
  malformed: "The payment provider sent an answer we could not read.",
};

export function providerFail<T = never>(kind: ProviderFailureKind, httpStatus: number | null = null): ProviderResult<T> {
  return {
    ok: false,
    error: {
      kind,
      message: FAILURE_TEXT[kind],
      httpStatus,
      definitelyNotProcessed: kind === "rejected" || kind === "unauthorized" || kind === "not_found",
    },
  };
}
