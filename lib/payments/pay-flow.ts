import type { PaymentAttempt } from "../../contracts/entities";
import type { PaymentAttemptStatus, UiActionState } from "../../contracts/enums";
import { AppError, type AppErrorShape } from "../../contracts/errors";
import { PAYMENT_ATTEMPT_TRANSITIONS } from "../../contracts/state-machines";
import { PAYMENT_STATUS_PRESENTATION, failureCopy, isInFlight } from "../member/payment-status";
import { isSafeAuthorizationUrl } from "./callback";

/**
 * Client side state of one payment, as a pure reducer.
 *
 * Safety rules, each covered by tests:
 * 1. Success exists only when the server returns an attempt with status `successful`. No other event can produce it.
 * 2. A failed verification call is NEVER shown as a failed payment. Money may have moved, so it becomes
 *    `outcome_unknown` and the member is told not to pay again.
 * 3. Repeat submissions are ignored while busy.
 * 4. After a verification problem there is no way to start a new payment from this state, only to verify again.
 * 5. Late or out of order updates cannot move a payment backwards or out of a final state.
 * 6. The browser is only sent to an allowed https payment host.
 */

export type PayPhase = "editing" | "submitting" | "redirecting" | "confirming" | "succeeded" | "failed" | "outcome_unknown" | "still_pending";

/**
 * What the member may safely do next.
 * - repeat: send the same request again, it cannot charge twice (same idempotency key, or verification)
 * - new_attempt: this attempt is over, a new one needs a new key
 * - none: nothing to retry here
 */
export type RetryMode = "none" | "repeat" | "new_attempt";

export interface PayFlowState {
  readonly phase: PayPhase;
  readonly attempt: PaymentAttempt | null;
  /** Reference to verify. Set from the attempt, or from the provider redirect on a fresh page. */
  readonly reference: string | null;
  readonly authorizationUrl: string | null;
  readonly error: AppErrorShape | null;
  readonly retry: RetryMode;
  /** Which step an unknown outcome came from. Decides whether "repeat" means submit again or verify again. */
  readonly lastStep: "initiate" | "verify" | null;
  readonly fieldErrors: Readonly<Record<string, string>> | null;
  readonly polls: number;
}

export const initialPayFlow: PayFlowState = {
  phase: "editing",
  attempt: null,
  reference: null,
  authorizationUrl: null,
  error: null,
  retry: "none",
  lastStep: null,
  fieldErrors: null,
  polls: 0,
};

export type PayFlowEvent =
  | { type: "validation_failed"; fields: Record<string, string> }
  | { type: "submit" }
  | { type: "initiate_succeeded"; attempt: PaymentAttempt; authorizationUrl: string | null }
  /** error is null when no reply arrived at all (network drop, client timeout). */
  | { type: "initiate_failed"; error: AppErrorShape | null }
  | { type: "returned"; reference: string }
  | { type: "attempt_update"; attempt: PaymentAttempt }
  | { type: "verify_failed"; error: AppErrorShape | null }
  | { type: "poll_exhausted" }
  | { type: "verify_again" }
  | { type: "reset" };

function reachable(from: PaymentAttemptStatus, to: PaymentAttemptStatus): boolean {
  if (from === to) {
    return true;
  }
  const seen = new Set<PaymentAttemptStatus>([from]);
  const queue: PaymentAttemptStatus[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as PaymentAttemptStatus;
    for (const next of PAYMENT_ATTEMPT_TRANSITIONS[current]) {
      if (next === to) {
        return true;
      }
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function canSubmit(state: PayFlowState): boolean {
  return (
    state.phase === "editing" ||
    (state.phase === "outcome_unknown" && state.retry === "repeat" && state.lastStep === "initiate") ||
    (state.phase === "failed" && state.retry === "new_attempt")
  );
}

export function canVerifyAgain(state: PayFlowState): boolean {
  return state.reference !== null && state.retry === "repeat" && ((state.phase === "outcome_unknown" && state.lastStep === "verify") || state.phase === "still_pending");
}

export function isBusy(state: PayFlowState): boolean {
  return state.phase === "submitting" || state.phase === "redirecting" || state.phase === "confirming";
}

/** True only for final outcomes. An unknown or pending outcome keeps its key, so a retry cannot charge twice. */
export function shouldReleaseKey(state: PayFlowState): boolean {
  return state.phase === "succeeded" || state.phase === "failed";
}

export function uiState(state: PayFlowState): UiActionState {
  switch (state.phase) {
    case "editing":
      return "idle";
    case "submitting":
    case "redirecting":
    case "confirming":
      return "processing";
    case "succeeded":
      return "success";
    case "failed":
      return state.retry === "new_attempt" ? "recoverable_failure" : "terminal_failure";
    case "outcome_unknown":
    case "still_pending":
      return state.retry === "repeat" ? "recoverable_failure" : "terminal_failure";
  }
}

function settle(state: PayFlowState, attempt: PaymentAttempt): PayFlowState {
  const base = { ...state, attempt, reference: attempt.reference, authorizationUrl: null, fieldErrors: null, error: null, lastStep: null } as const;
  if (attempt.status === "successful") {
    return { ...base, phase: "succeeded", retry: "none" };
  }
  if (isInFlight(attempt.status)) {
    return { ...base, phase: "confirming", retry: "none" };
  }
  if (attempt.status === "reversed") {
    return { ...base, phase: "failed", retry: "none" };
  }
  // failed, cancelled, expired: this attempt is over for good
  return { ...base, phase: "failed", retry: "new_attempt" };
}

export function payFlowReducer(state: PayFlowState, event: PayFlowEvent): PayFlowState {
  switch (event.type) {
    case "validation_failed": {
      if (state.phase !== "editing") return state;
      return { ...state, fieldErrors: event.fields };
    }

    case "submit": {
      if (!canSubmit(state)) return state;
      return { ...initialPayFlow, phase: "submitting" };
    }

    case "initiate_succeeded": {
      if (state.phase !== "submitting") return state;
      const next = settle(state, event.attempt);
      if (next.phase === "confirming" && event.authorizationUrl !== null) {
        if (!isSafeAuthorizationUrl(event.authorizationUrl)) {
          return {
            ...next,
            phase: "failed",
            retry: "new_attempt",
            error: new AppError("PAYMENT_PROVIDER_UNAVAILABLE", { reference: event.attempt.reference }).toShape(),
          };
        }
        return { ...next, phase: "redirecting", authorizationUrl: event.authorizationUrl };
      }
      return next;
    }

    case "initiate_failed": {
      if (state.phase !== "submitting") return state;
      const { error } = event;
      if (error === null) {
        return { ...state, phase: "outcome_unknown", error: null, retry: "repeat", lastStep: "initiate" };
      }
      if (error.moneyMoved === "unknown") {
        return { ...state, phase: "outcome_unknown", error, retry: error.retrySafe ? "repeat" : "none", lastStep: "initiate" };
      }
      if (error.moneyMoved === "yes") {
        return { ...state, phase: "failed", error, retry: "none", lastStep: null };
      }
      return { ...state, phase: "failed", error, retry: error.retrySafe ? "new_attempt" : "none", lastStep: null };
    }

    case "returned": {
      if (state.phase !== "editing" && state.phase !== "redirecting") return state;
      if (state.reference !== null && state.reference !== event.reference) return state;
      return { ...state, phase: "confirming", reference: event.reference, authorizationUrl: null, error: null, retry: "none", lastStep: null, polls: 0 };
    }

    case "attempt_update": {
      if (state.phase !== "confirming") return state;
      if (state.reference !== null && event.attempt.reference !== state.reference) return state;
      // A late response from earlier in the payment must not move it backwards.
      if (state.attempt !== null && !reachable(state.attempt.status, event.attempt.status)) return state;
      const next = settle(state, event.attempt);
      return next.phase === "confirming" ? { ...next, polls: state.polls + 1 } : next;
    }

    case "verify_failed": {
      if (state.phase !== "confirming") return state;
      const retry: RetryMode = event.error === null || event.error.retrySafe ? "repeat" : "none";
      return { ...state, phase: "outcome_unknown", error: event.error, retry, lastStep: "verify" };
    }

    case "poll_exhausted": {
      if (state.phase !== "confirming") return state;
      return { ...state, phase: "still_pending", error: null, retry: "repeat", lastStep: "verify" };
    }

    case "verify_again": {
      if (!canVerifyAgain(state)) return state;
      return { ...state, phase: "confirming", error: null, retry: "none", lastStep: null, polls: 0 };
    }

    case "reset": {
      if (state.phase !== "succeeded" && state.phase !== "failed") return state;
      return initialPayFlow;
    }
  }
}

export interface OutcomeCopy {
  readonly title: string;
  readonly message: string;
  readonly action: string;
  readonly reference: string | null;
}

/** What to tell the member. Null while nothing needs saying. Every message states whether money may have moved. */
export function outcomeCopy(state: PayFlowState): OutcomeCopy | null {
  switch (state.phase) {
    case "succeeded":
      return {
        title: "Payment received",
        message: PAYMENT_STATUS_PRESENTATION.successful.explanation,
        action: "Your receipt is in your history.",
        reference: state.reference,
      };
    case "failed": {
      if (state.error !== null) {
        return { title: "Payment not completed", message: state.error.message, action: state.error.action, reference: state.error.reference };
      }
      if (state.attempt !== null) {
        const presentation = PAYMENT_STATUS_PRESENTATION[state.attempt.status];
        const copy = failureCopy(state.attempt.failureCode);
        return {
          title: `Payment ${presentation.label.toLowerCase()}`,
          message: copy?.message ?? presentation.explanation,
          action: state.retry === "new_attempt" ? (copy?.action ?? "Start the payment again.") : "Contact support if you need help.",
          reference: state.reference,
        };
      }
      return null;
    }
    case "outcome_unknown": {
      if (state.error !== null) {
        return { title: "We could not confirm this payment", message: state.error.message, action: state.error.action, reference: state.error.reference };
      }
      if (state.lastStep === "initiate") {
        return {
          title: "No reply from us",
          message: "We did not get a reply, so we are not sure the payment started.",
          action: "Try again. It is safe, you will not be charged twice.",
          reference: null,
        };
      }
      return {
        title: "We could not confirm this payment",
        message: "We could not check the result right now. Do not pay again.",
        action: "Check again in a moment, or look at your payment history.",
        reference: state.reference,
      };
    }
    case "still_pending":
      return {
        title: "Still confirming",
        message: "We are still waiting for confirmation from the payment provider. Do not pay again.",
        action: "Check again in a moment, or look at your payment history later.",
        reference: state.reference,
      };
    case "editing":
    case "submitting":
    case "redirecting":
    case "confirming":
      return null;
  }
}
