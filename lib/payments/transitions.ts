/**
 * Transition guards over the frozen tables in contracts/state-machines.ts.
 * The tables stay the single source of truth. Nothing here adds an edge.
 */
import type { ObligationStatus, PaymentAttemptStatus, PayoutStatus, RefundStatus } from "@/contracts/enums";
import {
  OBLIGATION_TRANSITIONS,
  PAYMENT_ATTEMPT_TERMINAL,
  PAYMENT_ATTEMPT_TRANSITIONS,
  PAYOUT_TRANSITIONS,
  REFUND_TRANSITIONS,
  canTransition,
} from "@/contracts/state-machines";

export const canPaymentTransition = (from: PaymentAttemptStatus, to: PaymentAttemptStatus): boolean =>
  canTransition(PAYMENT_ATTEMPT_TRANSITIONS, from, to);

export const canObligationTransition = (from: ObligationStatus, to: ObligationStatus): boolean =>
  canTransition(OBLIGATION_TRANSITIONS, from, to);

export const canPayoutTransition = (from: PayoutStatus, to: PayoutStatus): boolean =>
  canTransition(PAYOUT_TRANSITIONS, from, to);

export const canRefundTransition = (from: RefundStatus, to: RefundStatus): boolean =>
  canTransition(REFUND_TRANSITIONS, from, to);

/**
 * True when settlement has nothing left to do for the attempt: it is terminal, or already successful.
 * `successful` is not in PAYMENT_ATTEMPT_TERMINAL because it can still become `reversed`,
 * but a settlement run must not touch it again.
 */
export function isSettlementClosed(status: PaymentAttemptStatus): boolean {
  return status === "successful" || PAYMENT_ATTEMPT_TERMINAL.includes(status);
}

/**
 * The ordered compare and set steps needed to reach `verifying` from a status.
 * The contract allows `verifying` only from `processing`, so earlier states pass through it.
 * Null means the attempt cannot be moved to verifying from that status.
 */
export function pathToVerifying(from: PaymentAttemptStatus): readonly PaymentAttemptStatus[] | null {
  switch (from) {
    case "initiating":
    case "awaiting_authentication":
      return ["processing", "verifying"];
    case "processing":
      return ["verifying"];
    case "verifying":
      return [];
    default:
      return null;
  }
}

/**
 * The ordered steps needed to expire an unfinished attempt.
 * `verifying` cannot expire directly, so it steps back to `processing` first.
 * Null means the status cannot expire.
 */
export function pathToExpired(from: PaymentAttemptStatus): readonly PaymentAttemptStatus[] | null {
  switch (from) {
    case "initiating":
    case "awaiting_authentication":
    case "processing":
      return ["expired"];
    case "verifying":
      return ["processing", "expired"];
    default:
      return null;
  }
}

/** True when every step in the path is an allowed edge, starting at `from`. */
export function isLegalPaymentPath(from: PaymentAttemptStatus, path: readonly PaymentAttemptStatus[]): boolean {
  let current = from;
  for (const next of path) {
    if (!canPaymentTransition(current, next)) return false;
    current = next;
  }
  return true;
}
