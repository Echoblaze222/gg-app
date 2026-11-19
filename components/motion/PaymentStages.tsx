"use client";

import { useEffect, useRef } from "react";
import { LiveRegion } from "./LiveRegion";

/**
 * Payment stage animations (RESEARCH.md 4.6, payment rows). One coin, one card, one ledger row.
 *
 * It only draws. `state` and `failure` come from the server and the component never moves on by itself:
 *   idle, initiating, awaiting_auth, processing, verifying, then one of
 *   successful, failed, cancelled, expired. `pending_long` is shown when the server is slow
 *   (parent decides when): a calm hourglass with the elapsed time, never an endless spinner.
 * Success is drawn only for `successful`, which the parent sets only after the server verified the payment.
 * A failure always shows the server's own message, what to do next, and whether money may have moved.
 * Reduced motion: the end state of each stage appears at once. Every stage also has a text status.
 */

export type PaymentStageState =
  | "idle"
  | "initiating"
  | "awaiting_auth"
  | "processing"
  | "verifying"
  | "successful"
  | "pending_long"
  | "failed"
  | "cancelled"
  | "expired";

export type MoneyMoved = "no" | "unknown" | "yes";

export interface PaymentFailure {
  /** The server's message for the person. Says what happened. */
  message: string;
  /** What the person can do next. */
  action?: string;
  moneyMoved: MoneyMoved;
}

export interface PaymentStagesProps {
  state: PaymentStageState;
  failure?: PaymentFailure;
  /** For pending_long, for example "Waiting for 2 minutes". Not announced to screen readers on every change. */
  elapsedLabel?: string;
  /** Called once when the success stamp has finished, so the parent can hand over to the receipt printer. */
  onSettled?: () => void;
  messages?: Partial<Record<PaymentStageState, string>>;
}

const DEFAULT_MESSAGES: Record<PaymentStageState, string> = {
  idle: "Ready when you are.",
  initiating: "Starting your payment.",
  awaiting_auth: "Waiting for your bank to approve this payment.",
  processing: "Processing your payment.",
  verifying: "Confirming your payment with Paystack.",
  successful: "Payment confirmed.",
  pending_long: "This is taking longer than usual. We will notify you when it is confirmed.",
  failed: "The payment did not go through. Check your payment history to see whether any money moved.",
  cancelled: "Payment cancelled.",
  expired: "This payment was not completed and has expired.",
};

const MONEY_LABEL: Record<MoneyMoved, string> = {
  no: "No money moved.",
  unknown: "Money may have moved. Check your payment history before trying again.",
  yes: "Money moved.",
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function CardIcon() {
  return (
    <svg viewBox="0 0 64 44" width="64" height="44" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="61" height="41" rx="7" stroke="currentColor" strokeWidth="2" />
      <path d="M2 14h60" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="26" width="16" height="6" rx="2" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" fill="currentColor" />
      <path className="pay__shackle" d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PaymentStages({ state, failure, elapsedLabel, onSettled, messages }: PaymentStagesProps) {
  const words = { ...DEFAULT_MESSAGES, ...messages };
  const settled = useRef(false);
  const settledRef = useRef(onSettled);
  const checkRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  useEffect(() => {
    if (state !== "successful") {
      settled.current = false;
      return;
    }
    // No animation will run, so nothing would ever tell us the stamp finished.
    if (prefersReducedMotion() && !settled.current) {
      settled.current = true;
      settledRef.current?.();
    }
  }, [state]);

  useEffect(() => {
    const check = checkRef.current;
    if (!check) return;
    const onEnd = (e: Event) => {
      if ((e as AnimationEvent).animationName === "pay-check" && !settled.current) {
        settled.current = true;
        settledRef.current?.();
      }
    };
    check.addEventListener("animationend", onEnd);
    return () => check.removeEventListener("animationend", onEnd);
  }, []);

  const isFailure = state === "failed";
  const moneyMoved = isFailure ? (failure?.moneyMoved ?? "unknown") : undefined;
  const headline = isFailure ? (failure?.message ?? words.failed) : words[state];
  const announce = state === "idle" ? "" : headline;

  return (
    <figure className="pay" data-state={state} data-money={moneyMoved}>
      <div className="pay__scene" aria-hidden="true">
        <div className="pay__card">
          <CardIcon />
          <span className="pay__lock">
            <LockIcon />
          </span>
        </div>

        <div className="pay__track">
          <span className="pay__ring" />
          <span className="pay__dot pay__dot--1" />
          <span className="pay__dot pay__dot--2" />
          <span className="pay__dot pay__dot--3" />
          <span className="pay__coin" />
          <span className="pay__glass">
            <span className="pay__sand" />
          </span>
        </div>

        <div className="pay__ledger">
          <span className="pay__row" />
          <span className="pay__row pay__row--short" />
          <span className="pay__scan" />
          <svg ref={checkRef} className="pay__check" viewBox="0 0 24 24" width="26" height="26" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <figcaption className="pay__text">
        <p className="pay__headline">{headline}</p>
        {isFailure && failure?.action ? <p className="pay__action">{failure.action}</p> : null}
        {moneyMoved ? <p className="pay__money">{MONEY_LABEL[moneyMoved]}</p> : null}
        {state === "pending_long" && elapsedLabel ? <p className="pay__elapsed">{elapsedLabel}</p> : null}
      </figcaption>
      <LiveRegion message={announce} />
    </figure>
  );
}
