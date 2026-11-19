"use client";

import { useEffect, useRef } from "react";
import { LiveRegion } from "./LiveRegion";

/**
 * "Password reset sent" (RESEARCH.md 4.6). An open envelope folds shut and slides out of view, and a check takes its place.
 * It only draws. The parent sets `state="sent"` after the server accepted the request.
 * With reduced motion the check shows at once and onSettled is called straight away.
 */

export interface EnvelopeSentProps {
  state: "idle" | "sent";
  /** Spoken when the request was sent. */
  message?: string;
  onSettled?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EnvelopeSent({ state, message = "Email sent.", onSettled }: EnvelopeSentProps) {
  const checkRef = useRef<SVGSVGElement>(null);
  const settled = useRef(false);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  useEffect(() => {
    if (state !== "sent") {
      settled.current = false;
      return;
    }
    if (prefersReducedMotion() && !settled.current) {
      settled.current = true;
      settledRef.current?.();
    }
  }, [state]);

  useEffect(() => {
    const check = checkRef.current;
    if (!check) return;
    const onEnd = (e: Event) => {
      if ((e as AnimationEvent).animationName === "env-check" && !settled.current) {
        settled.current = true;
        settledRef.current?.();
      }
    };
    check.addEventListener("animationend", onEnd);
    return () => check.removeEventListener("animationend", onEnd);
  }, []);

  return (
    <div className="env" data-state={state}>
      <div className="env__stage" aria-hidden="true">
        <svg className="env__mail" viewBox="0 0 72 56" width="72" height="56" fill="none">
          <rect x="2" y="8" width="68" height="46" rx="8" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2.5" />
          <path d="M6 14l30 20 30-20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
          <path className="env__flap" d="M2 10l34 24 34-24z" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <svg ref={checkRef} className="env__check" viewBox="0 0 24 24" width="44" height="44" fill="none">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <LiveRegion message={state === "sent" ? message : ""} />
    </div>
  );
}
