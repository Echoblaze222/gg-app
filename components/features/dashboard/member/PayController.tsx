"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { getAttemptAction, initiatePaymentAction, verifyPaymentAction } from "@/lib/dashboard/actions";
import { createBrowserKeyStore, createIntentKeys } from "@/lib/payments/idempotency";
import type { IntentKeys } from "@/lib/payments/idempotency";
import { buildInitiateInput } from "@/lib/payments/intent";
import type { PaymentIntent } from "@/lib/payments/intent";
import { MAX_POLLS, pollDelayMs } from "@/lib/payments/poll";
import { canSubmit, canVerifyAgain, initialPayFlow, isBusy, outcomeCopy, payFlowReducer, shouldReleaseKey } from "@/lib/payments/pay-flow";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // blocked or unavailable: the key store falls back to memory
  }
}

export interface PayControllerProps {
  /** What is being paid. Built on the server from the member's real obligation. Null when returning from the provider. */
  intent: PaymentIntent | null;
  amountLabel: string;
  /** Set when the provider sent the member back: starts straight in confirming. */
  returnedReference: string | null;
}

/**
 * Drives one payment with AI-5's reducer (lib/payments/pay-flow.ts), which holds every safety rule:
 * success only from a server attempt marked successful, an unknown outcome is never shown as failed, and no second payment
 * can start while the first is unconfirmed. This component only does the I/O and renders.
 */
export function PayController({ intent, amountLabel, returnedReference }: PayControllerProps) {
  const [state, dispatch] = useReducer(payFlowReducer, initialPayFlow);
  const [tick, setTick] = useState(0);
  const [offline, setOffline] = useState(false);
  const keysRef = useRef<IntentKeys | null>(null);
  /** Created on first use in the browser, never during render. */
  const getKeys = (): IntentKeys => (keysRef.current ??= createIntentKeys({ store: createBrowserKeyStore(browserStorage()), now: () => Date.now(), newId: () => crypto.randomUUID() }));

  // Back from the provider: the redirect only tells us which reference to verify. It proves nothing.
  useEffect(() => {
    if (returnedReference) dispatch({ type: "returned", reference: returnedReference });
  }, [returnedReference]);

  // Go to the provider page. The reducer already checked the address is https on an allowed host.
  useEffect(() => {
    if (state.phase === "redirecting" && state.authorizationUrl) window.location.assign(state.authorizationUrl);
  }, [state.phase, state.authorizationUrl]);

  // Only a final outcome releases the idempotency key. An unknown outcome keeps it so a retry cannot charge twice.
  useEffect(() => {
    if (intent && shouldReleaseKey(state)) getKeys().release(intent);
  }, [state, intent]);

  // Confirming: verify with the provider once, then poll the attempt on AI-5's backoff schedule, then stop honestly.
  useEffect(() => {
    if (state.phase !== "confirming" || !state.reference) return;
    if (state.polls >= MAX_POLLS) {
      dispatch({ type: "poll_exhausted" });
      return;
    }
    let cancelled = false;
    const delay = state.polls === 0 ? 0 : (pollDelayMs(state.polls - 1, Math.random) ?? 0);
    const reference = state.reference;
    const attemptId = state.attempt?.id ?? null;
    const first = state.polls === 0 || attemptId === null;
    const timer = setTimeout(async () => {
      try {
        const result = first ? await verifyPaymentAction({ reference }) : await getAttemptAction({ attemptId });
        if (cancelled) return;
        dispatch(result.ok ? { type: "attempt_update", attempt: result.value } : { type: "verify_failed", error: result.error });
      } catch {
        if (!cancelled) dispatch({ type: "verify_failed", error: null });
      } finally {
        if (!cancelled) setTick((t) => t + 1);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.phase, state.polls, state.reference, state.attempt?.id, tick]);

  async function submit() {
    if (!intent || !canSubmit(state)) return;
    if (!navigator.onLine) {
      setOffline(true); // nothing was sent, so no state change and no unknown outcome
      return;
    }
    setOffline(false);
    const built = buildInitiateInput(intent, getKeys().keyFor(intent));
    if (!built.ok) {
      dispatch({ type: "validation_failed", fields: built.fields });
      return;
    }
    dispatch({ type: "submit" });
    try {
      const result = await initiatePaymentAction(built.input);
      dispatch(result.ok ? { type: "initiate_succeeded", attempt: result.value.attempt, authorizationUrl: result.value.authorizationUrl } : { type: "initiate_failed", error: result.error });
    } catch {
      dispatch({ type: "initiate_failed", error: null }); // no reply at all: outcome unknown, same key on retry
    }
  }

  const busy = isBusy(state);
  const copy = outcomeCopy(state);
  const showPay = intent !== null && canSubmit(state) && state.phase !== "succeeded";
  const loadingLabel = state.phase === "redirecting" ? "Opening secure payment" : state.phase === "confirming" ? "Confirming payment" : "Starting payment";
  const tone = state.phase === "succeeded" ? "success" : state.phase === "failed" ? "error" : "pending";

  return (
    <div className="pay">
      {state.fieldErrors ? (
        <Alert tone="error" title="Check the payment details">
          {Object.values(state.fieldErrors).join(" ")} No money moved.
        </Alert>
      ) : null}

      {offline ? (
        <Alert tone="warning" title="You are offline">
          The payment was not started and no money moved. Reconnect, then try again.
        </Alert>
      ) : null}

      {copy ? (
        <Alert tone={tone} title={copy.title}>
          {copy.message} {copy.action}
          {copy.reference ? ` Reference ${copy.reference}.` : ""}
        </Alert>
      ) : null}

      <div className="pay__actions">
        {busy ? (
          <Button variant="primary" size="lg" status="loading" loadingLabel={loadingLabel}>
            {`Pay ${amountLabel}`}
          </Button>
        ) : showPay ? (
          <Button variant="primary" size="lg" onClick={submit}>
            {state.phase === "editing" ? `Pay ${amountLabel}` : `Try again, pay ${amountLabel}`}
          </Button>
        ) : null}

        {canVerifyAgain(state) ? (
          <Button variant="secondary" size="lg" onClick={() => dispatch({ type: "verify_again" })}>
            Check again
          </Button>
        ) : null}

        {state.phase === "succeeded" || state.phase === "failed" || state.phase === "still_pending" || state.phase === "outcome_unknown" ? (
          <Link href="/app" className="btn btn--quiet btn--lg">
            Back to home
          </Link>
        ) : null}
      </div>
    </div>
  );
}
