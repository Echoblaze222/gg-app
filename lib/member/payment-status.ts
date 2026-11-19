import type { PaymentAttemptStatus } from "../../contracts/enums";
import { ERROR_DEFINITIONS, type ErrorCode } from "../../contracts/errors";

export type StatusTone = "success" | "pending" | "failure" | "neutral" | "warning";

export interface StatusPresentation {
  readonly label: string;
  readonly tone: StatusTone;
  /** The payment will not change state again from the member's side. */
  readonly isFinal: boolean;
  /** The payment may still turn into a charge, so the member must not pay again. */
  readonly inFlight: boolean;
  readonly explanation: string;
}

/**
 * One entry for every server side state. Typed as a full Record, so adding a state to the contract
 * breaks the build here until its copy is written. Only the server's `successful` is ever shown as paid.
 */
export const PAYMENT_STATUS_PRESENTATION: Record<PaymentAttemptStatus, StatusPresentation> = {
  initiating: {
    label: "Starting",
    tone: "pending",
    isFinal: false,
    inFlight: true,
    explanation: "We are setting up your payment. Do not pay again.",
  },
  awaiting_authentication: {
    label: "Waiting for approval",
    tone: "pending",
    isFinal: false,
    inFlight: true,
    explanation: "Your bank needs you to approve this payment. Do not pay again.",
  },
  processing: {
    label: "Processing",
    tone: "pending",
    isFinal: false,
    inFlight: true,
    explanation: "Your payment is being processed. Do not pay again. This page updates when it is confirmed.",
  },
  verifying: {
    label: "Confirming",
    tone: "pending",
    isFinal: false,
    inFlight: true,
    explanation: "We are confirming this with the payment provider. Do not pay again.",
  },
  successful: {
    label: "Successful",
    tone: "success",
    isFinal: true,
    inFlight: false,
    explanation: "Your payment was received.",
  },
  failed: {
    label: "Failed",
    tone: "failure",
    isFinal: true,
    inFlight: false,
    explanation: "The payment did not go through. You were not charged.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    isFinal: true,
    inFlight: false,
    explanation: "This payment was cancelled. You were not charged.",
  },
  expired: {
    label: "Expired",
    tone: "neutral",
    isFinal: true,
    inFlight: false,
    explanation: "This payment was not completed and has expired. You were not charged.",
  },
  reversed: {
    label: "Reversed",
    tone: "warning",
    isFinal: true,
    inFlight: false,
    explanation: "This payment was reversed. Contact support if you need help.",
  },
};

export function isInFlight(status: PaymentAttemptStatus): boolean {
  return PAYMENT_STATUS_PRESENTATION[status].inFlight;
}

/**
 * Member facing copy for a stored failure code. Only payment codes are shown, so internal codes
 * (webhook, platform) can never reach a screen through this path. Unknown codes return null.
 */
export function failureCopy(code: string | null): { message: string; action: string } | null {
  if (code === null || !code.startsWith("PAYMENT_") || !Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code)) {
    return null;
  }
  const definition = ERROR_DEFINITIONS[code as ErrorCode];
  return { message: definition.message, action: definition.action };
}
