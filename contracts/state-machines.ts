/**
 * FROZEN CONTRACT: allowed state transitions.
 * Code and database checks must both enforce these tables. A transition not listed here is rejected.
 */
import type { PaymentAttemptStatus, PayoutStatus, ObligationStatus, RefundStatus } from "./enums";

export const PAYMENT_ATTEMPT_TRANSITIONS: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  initiating: ["awaiting_authentication", "processing", "failed", "cancelled", "expired"],
  awaiting_authentication: ["processing", "failed", "cancelled", "expired"],
  processing: ["verifying", "failed", "expired"],
  verifying: ["successful", "failed", "processing"],
  successful: ["reversed"],
  failed: [],
  cancelled: [],
  expired: [],
  reversed: [],
};

export const PAYMENT_ATTEMPT_TERMINAL: readonly PaymentAttemptStatus[] = ["failed", "cancelled", "expired", "reversed"];

export const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  requested: ["verified", "rejected", "cancelled"],
  verified: ["approved", "rejected", "cancelled"],
  approved: ["processing", "rejected", "cancelled"],
  processing: ["paid", "failed"],
  paid: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

export const OBLIGATION_TRANSITIONS: Record<ObligationStatus, readonly ObligationStatus[]> = {
  scheduled: ["due", "cancelled"],
  due: ["paid", "missed", "cancelled"],
  paid: [],
  missed: ["paid", "cancelled"],
  cancelled: [],
};

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["processing", "rejected"],
  processing: ["completed", "failed"],
  completed: [],
  rejected: [],
  failed: [],
};

export function canTransition<S extends string>(table: Record<S, readonly S[]>, from: S, to: S): boolean {
  return table[from].includes(to);
}
