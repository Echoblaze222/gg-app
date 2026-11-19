import { describe, expect, it } from "vitest";
import type { PaymentAttempt } from "../../contracts/entities";
import { PAYMENT_ATTEMPT_STATUSES, type PaymentAttemptStatus } from "../../contracts/enums";
import { AppError, type ErrorCode } from "../../contracts/errors";
import {
  canSubmit,
  canVerifyAgain,
  initialPayFlow,
  isBusy,
  outcomeCopy,
  payFlowReducer,
  shouldReleaseKey,
  uiState,
  type PayFlowEvent,
  type PayFlowState,
} from "./pay-flow";

const REF = "GG_ref-123456";
const GOOD_URL = "https://checkout.paystack.com/abc123";

function attempt(status: PaymentAttemptStatus, overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "at-1",
    memberId: "m-1",
    purpose: "one_time_contribution",
    channel: "card",
    amountKobo: 500000,
    currency: "NGN",
    status,
    reference: REF,
    idempotencyKey: "gg_valid-key-aaaaaaaaaaaaaaaa",
    obligationId: null,
    paymentMethodId: null,
    providerTransactionId: null,
    failureCode: null,
    createdAt: "2026-11-14T10:00:00.000Z",
    updatedAt: "2026-11-14T10:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function err(code: ErrorCode) {
  return new AppError(code, { reference: "req-1" }).toShape();
}

function run(events: PayFlowEvent[], from: PayFlowState = initialPayFlow): PayFlowState {
  return events.reduce(payFlowReducer, from);
}

const submitted = run([{ type: "submit" }]);
const redirecting = run([{ type: "submit" }, { type: "initiate_succeeded", attempt: attempt("awaiting_authentication"), authorizationUrl: GOOD_URL }]);
const confirming = run([{ type: "returned", reference: REF }]);

describe("redirect flow", () => {
  it("goes idle, submitting, redirecting and keeps the safe url", () => {
    expect(uiState(initialPayFlow)).toBe("idle");
    expect(submitted.phase).toBe("submitting");
    expect(uiState(submitted)).toBe("processing");
    expect(redirecting.phase).toBe("redirecting");
    expect(redirecting.authorizationUrl).toBe(GOOD_URL);
    expect(redirecting.reference).toBe(REF);
    expect(isBusy(redirecting)).toBe(true);
  });

  it("does not show success just because the member came back from the provider", () => {
    expect(confirming.phase).toBe("confirming");
    expect(confirming.attempt).toBeNull();
    expect(uiState(confirming)).toBe("processing");
    expect(outcomeCopy(confirming)).toBeNull();
  });

  it("succeeds only when the server returns a successful attempt", () => {
    const done = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful") });
    expect(done.phase).toBe("succeeded");
    expect(uiState(done)).toBe("success");
    expect(shouldReleaseKey(done)).toBe(true);
    expect(outcomeCopy(done)?.title).toBe("Payment received");
  });

  it("ignores an update for a different payment reference", () => {
    const next = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful", { reference: "OTHER_ref-999999" }) });
    expect(next).toBe(confirming);
  });

  it("ignores a return with a different reference than the one already tracked", () => {
    const next = payFlowReducer(redirecting, { type: "returned", reference: "OTHER_ref-999999" });
    expect(next).toBe(redirecting);
  });

  it("returning from the provider continues the tracked attempt", () => {
    const next = payFlowReducer(redirecting, { type: "returned", reference: REF });
    expect(next.phase).toBe("confirming");
    expect(next.attempt?.id).toBe("at-1");
    expect(next.authorizationUrl).toBeNull();
  });
});

describe("saved method flow without redirect", () => {
  it("confirms in place and counts polls", () => {
    const start = run([{ type: "submit" }, { type: "initiate_succeeded", attempt: attempt("processing"), authorizationUrl: null }]);
    expect(start.phase).toBe("confirming");
    const polled = payFlowReducer(start, { type: "attempt_update", attempt: attempt("verifying") });
    expect(polled.phase).toBe("confirming");
    expect(polled.polls).toBe(1);
    expect(payFlowReducer(polled, { type: "attempt_update", attempt: attempt("successful") }).phase).toBe("succeeded");
  });
});

describe("unsafe payment urls", () => {
  it.each([
    ["http://checkout.paystack.com/abc"],
    ["javascript:alert(1)"],
    ["https://checkout.paystack.com.evil.example/abc"],
    ["https://checkout.paystack.com@evil.example/abc"],
    [""],
  ])("never redirects to %s", (url) => {
    const next = run([{ type: "submit" }, { type: "initiate_succeeded", attempt: attempt("awaiting_authentication"), authorizationUrl: url }]);
    expect(next.phase).toBe("failed");
    expect(next.authorizationUrl).toBeNull();
    expect(next.retry).toBe("new_attempt");
    expect(next.error?.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    expect(next.error?.reference).toBe(REF);
  });
});

describe("repeat clicks", () => {
  it.each([["submitting", submitted], ["redirecting", redirecting], ["confirming", confirming]])("a second submit while %s changes nothing", (_name, state) => {
    expect(payFlowReducer(state, { type: "submit" })).toBe(state);
    expect(canSubmit(state)).toBe(false);
  });

  it("cannot submit after success", () => {
    const done = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful") });
    expect(payFlowReducer(done, { type: "submit" })).toBe(done);
  });
});

describe("only a successful attempt is ever success", () => {
  it.each(PAYMENT_ATTEMPT_STATUSES.map((s) => [s]))("initiate result %s", (status) => {
    const next = run([{ type: "submit" }, { type: "initiate_succeeded", attempt: attempt(status as PaymentAttemptStatus), authorizationUrl: null }]);
    expect(next.phase === "succeeded").toBe(status === "successful");
  });

  it.each(PAYMENT_ATTEMPT_STATUSES.map((s) => [s]))("verify result %s", (status) => {
    const next = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt(status as PaymentAttemptStatus) });
    expect(next.phase === "succeeded").toBe(status === "successful");
  });

  it("maps final failures to a new attempt, and a reversal to nothing", () => {
    for (const status of ["failed", "cancelled", "expired"] as const) {
      const next = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt(status) });
      expect(next.phase).toBe("failed");
      expect(next.retry).toBe("new_attempt");
      expect(canSubmit(next)).toBe(true);
      expect(shouldReleaseKey(next)).toBe(true);
    }
    const reversed = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("reversed") });
    expect(reversed.phase).toBe("failed");
    expect(reversed.retry).toBe("none");
    expect(canSubmit(reversed)).toBe(false);
  });

  it("shows contract copy for a known failure code", () => {
    const next = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("failed", { failureCode: "PAYMENT_DECLINED" }) });
    expect(outcomeCopy(next)?.message).toContain("declined");
    expect(outcomeCopy(next)?.title).toBe("Payment failed");
  });
});

describe("a failed check is never a failed payment", () => {
  it.each([[null], [err("SYSTEM_UNAVAILABLE")], [err("AUTH_SESSION_EXPIRED")], [err("PAYMENT_PROVIDER_TIMEOUT")]])("verify_failed with %j", (error) => {
    const next = payFlowReducer(confirming, { type: "verify_failed", error });
    expect(next.phase).toBe("outcome_unknown");
    expect(next.phase).not.toBe("failed");
    expect(next.lastStep).toBe("verify");
    expect(shouldReleaseKey(next)).toBe(false);
  });

  it("cannot start a new payment after a verification problem, only verify again", () => {
    const unknown = payFlowReducer(confirming, { type: "verify_failed", error: null });
    expect(canSubmit(unknown)).toBe(false);
    expect(payFlowReducer(unknown, { type: "submit" })).toBe(unknown);
    expect(canVerifyAgain(unknown)).toBe(true);
    expect(payFlowReducer(unknown, { type: "verify_again" }).phase).toBe("confirming");
  });

  it("offers no repeat when the error says repeating is not safe", () => {
    const unknown = payFlowReducer(confirming, { type: "verify_failed", error: err("AUTH_SESSION_EXPIRED") });
    expect(unknown.retry).toBe("none");
    expect(canVerifyAgain(unknown)).toBe(false);
    expect(payFlowReducer(unknown, { type: "verify_again" })).toBe(unknown);
    expect(uiState(unknown)).toBe("terminal_failure");
  });

  it("tells the member not to pay again", () => {
    const unknown = payFlowReducer(confirming, { type: "verify_failed", error: null });
    expect(outcomeCopy(unknown)?.message).toContain("Do not pay again");
  });

  it("becomes still pending after polling is exhausted and can check again", () => {
    const pending = payFlowReducer(confirming, { type: "poll_exhausted" });
    expect(pending.phase).toBe("still_pending");
    expect(outcomeCopy(pending)?.message).toContain("Do not pay again");
    expect(canSubmit(pending)).toBe(false);
    expect(canVerifyAgain(pending)).toBe(true);
    expect(payFlowReducer(pending, { type: "verify_again" }).phase).toBe("confirming");
    expect(shouldReleaseKey(pending)).toBe(false);
  });
});

describe("initiate failures", () => {
  const afterSubmit = (error: ReturnType<typeof err> | null) => payFlowReducer(submitted, { type: "initiate_failed", error });

  it("no reply at all: unknown outcome, safe to repeat with the same key, key kept", () => {
    const next = afterSubmit(null);
    expect(next.phase).toBe("outcome_unknown");
    expect(next.retry).toBe("repeat");
    expect(canSubmit(next)).toBe(true);
    expect(shouldReleaseKey(next)).toBe(false);
    expect(uiState(next)).toBe("recoverable_failure");
    expect(outcomeCopy(next)?.action).toContain("will not be charged twice");
  });

  it.each([["PAYMENT_DUPLICATE_IN_PROGRESS"], ["PAYMENT_PROVIDER_TIMEOUT"], ["SYSTEM_TIMEOUT"], ["INTERNAL"]] as const)("%s: unknown money, no blind retry, key kept", (code) => {
    const next = afterSubmit(err(code));
    expect(next.phase).toBe("outcome_unknown");
    expect(next.error?.code).toBe(code);
    if (!next.error?.retrySafe) {
      expect(canSubmit(next)).toBe(false);
    }
    expect(shouldReleaseKey(next)).toBe(false);
  });

  it.each([["PAYMENT_DECLINED"], ["PAYMENT_INSUFFICIENT_FUNDS"], ["PAYMENT_PROVIDER_UNAVAILABLE"], ["VALIDATION_FAILED"], ["CONTRIBUTION_OUT_OF_RANGE"], ["RATE_LIMITED"]] as const)(
    "%s: nothing charged and retry safe, so a new attempt with a new key",
    (code) => {
      const next = afterSubmit(err(code));
      expect(next.phase).toBe("failed");
      expect(next.retry).toBe("new_attempt");
      expect(canSubmit(next)).toBe(true);
      expect(shouldReleaseKey(next)).toBe(true);
    },
  );

  it.each([["AUTH_ACCOUNT_SUSPENDED"], ["PERMISSION_DENIED"], ["PAYMENT_NOT_REUSABLE"]] as const)("%s: not retryable", (code) => {
    const next = afterSubmit(err(code));
    expect(next.phase).toBe("failed");
    expect(next.retry).toBe("none");
    expect(canSubmit(next)).toBe(false);
  });

  it("money already moved: final, no retry", () => {
    const next = afterSubmit(err("PAYMENT_REVERSED"));
    expect(next.phase).toBe("failed");
    expect(next.retry).toBe("none");
  });

  it("ignores an initiate result when nothing is being submitted", () => {
    expect(payFlowReducer(initialPayFlow, { type: "initiate_failed", error: null })).toBe(initialPayFlow);
    expect(payFlowReducer(confirming, { type: "initiate_succeeded", attempt: attempt("successful"), authorizationUrl: null })).toBe(confirming);
  });

  it("a retry after an unknown initiate outcome submits again", () => {
    const unknown = afterSubmit(null);
    expect(payFlowReducer(unknown, { type: "submit" }).phase).toBe("submitting");
    expect(canVerifyAgain(unknown)).toBe(false);
  });
});

describe("late and out of order updates", () => {
  it("cannot leave a final state", () => {
    const done = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful") });
    expect(payFlowReducer(done, { type: "attempt_update", attempt: attempt("processing") })).toBe(done);
    const failed = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("failed") });
    expect(payFlowReducer(failed, { type: "attempt_update", attempt: attempt("successful") })).toBe(failed);
    expect(payFlowReducer(failed, { type: "verify_failed", error: null })).toBe(failed);
    expect(payFlowReducer(done, { type: "poll_exhausted" })).toBe(done);
  });

  it("cannot move backwards inside the in progress states", () => {
    const processing = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("processing") });
    expect(payFlowReducer(processing, { type: "attempt_update", attempt: attempt("initiating") })).toBe(processing);
    expect(payFlowReducer(processing, { type: "attempt_update", attempt: attempt("awaiting_authentication") })).toBe(processing);
  });

  it("accepts forward jumps, because polling only samples some states", () => {
    const initiating = run([{ type: "submit" }, { type: "initiate_succeeded", attempt: attempt("initiating"), authorizationUrl: null }]);
    expect(payFlowReducer(initiating, { type: "attempt_update", attempt: attempt("successful") }).phase).toBe("succeeded");
    expect(payFlowReducer(initiating, { type: "attempt_update", attempt: attempt("failed") }).phase).toBe("failed");
  });

  it("allows the verifying to processing step the contract permits", () => {
    const verifying = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("verifying") });
    expect(payFlowReducer(verifying, { type: "attempt_update", attempt: attempt("processing") }).attempt?.status).toBe("processing");
  });
});

describe("validation and reset", () => {
  it("records field errors only while editing", () => {
    const invalid = payFlowReducer(initialPayFlow, { type: "validation_failed", fields: { amountKobo: "too small" } });
    expect(invalid.fieldErrors).toEqual({ amountKobo: "too small" });
    expect(payFlowReducer(submitted, { type: "validation_failed", fields: { a: "b" } })).toBe(submitted);
  });

  it("submit clears old errors and attempts", () => {
    const failed = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("failed") });
    const again = payFlowReducer(failed, { type: "submit" });
    expect(again.phase).toBe("submitting");
    expect(again.attempt).toBeNull();
    expect(again.error).toBeNull();
    expect(again.reference).toBeNull();
  });

  it("reset works only from a final outcome", () => {
    const done = payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful") });
    expect(payFlowReducer(done, { type: "reset" })).toBe(initialPayFlow);
    expect(payFlowReducer(confirming, { type: "reset" })).toBe(confirming);
    const unknown = payFlowReducer(confirming, { type: "verify_failed", error: null });
    expect(payFlowReducer(unknown, { type: "reset" })).toBe(unknown);
  });
});

describe("copy and key release cover every phase", () => {
  it("busy and editing phases say nothing and keep the key", () => {
    for (const state of [initialPayFlow, submitted, redirecting, confirming]) {
      expect(outcomeCopy(state)).toBeNull();
      expect(shouldReleaseKey(state)).toBe(false);
    }
  });

  it("every outcome carries a message and an action", () => {
    const states = [
      payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("successful") }),
      payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("failed") }),
      payFlowReducer(confirming, { type: "attempt_update", attempt: attempt("reversed") }),
      payFlowReducer(confirming, { type: "verify_failed", error: null }),
      payFlowReducer(confirming, { type: "poll_exhausted" }),
      payFlowReducer(submitted, { type: "initiate_failed", error: null }),
      payFlowReducer(submitted, { type: "initiate_failed", error: err("PAYMENT_DECLINED") }),
    ];
    for (const state of states) {
      const copy = outcomeCopy(state);
      expect(copy?.message.length).toBeGreaterThan(0);
      expect(copy?.action.length).toBeGreaterThan(0);
    }
  });
});
