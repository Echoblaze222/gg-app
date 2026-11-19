"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { LiveRegion } from "./LiveRegion";

/**
 * One time code boxes (RESEARCH.md 4.6, "OTP entering").
 *
 * There is ONE real input. It takes typing, pasting, autofill from SMS and the phone keyboard. The boxes only
 * show what it holds, so assistive technology and password managers see a normal labelled field.
 *   idle       each digit pops into its box as it is typed
 *   verifying  the boxes pulse one after the other while the server checks the code
 *   success    the boxes merge into one check (the parent sets this only when the server accepted the code)
 *   error      the boxes shake and turn red, with the server's message
 * With reduced motion nothing moves: digits just appear, and success shows the check at once.
 */

export type OtpState = "idle" | "verifying" | "success" | "error";

export interface OtpInputProps {
  label: string;
  name?: string;
  length?: number;
  state?: OtpState;
  /** The server's message for a wrong code. Shown under the boxes when state is error. */
  error?: string;
  autoFocus?: boolean;
  onChange?: (code: string) => void;
  /** Called when all digits are in. A good moment to submit. */
  onComplete?: (code: string) => void;
  /** Called once when the success check has finished drawing. Also called at once with reduced motion. */
  onSettled?: () => void;
  messages?: Partial<Record<"verifying" | "success", string>>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function OtpInput({
  label,
  name = "code",
  length = 6,
  state = "idle",
  error,
  autoFocus,
  onChange,
  onComplete,
  onSettled,
  messages,
}: OtpInputProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const checkRef = useRef<SVGSVGElement>(null);
  const settled = useRef(false);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  useEffect(() => {
    if (state !== "success") {
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
      if ((e as AnimationEvent).animationName === "otp-check" && !settled.current) {
        settled.current = true;
        settledRef.current?.();
      }
    };
    check.addEventListener("animationend", onEnd);
    return () => check.removeEventListener("animationend", onEnd);
  }, []);

  const locked = state === "verifying" || state === "success";
  const active = Math.min(value.length, length - 1);
  const words = { verifying: "Checking the code.", success: "Code accepted.", ...messages };
  const announce = state === "verifying" ? words.verifying : state === "success" ? words.success : state === "error" ? (error ?? "") : "";

  function handleChange(raw: string) {
    // Strip spaces and dashes so "123 456" pasted from a message still works.
    const digits = raw.replace(/\D/g, "").slice(0, length);
    setValue(digits);
    onChange?.(digits);
    if (digits.length === length) onComplete?.(digits);
  }

  return (
    <div className="otp" data-state={state} style={{ "--n": length, "--c": (length - 1) / 2 } as CSSProperties}>
      <label htmlFor={id} className="otp__label">
        {label}
      </label>
      <div className="otp__field">
        <input
          id={id}
          name={name}
          className="otp__input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          autoFocus={autoFocus}
          readOnly={locked}
          value={value}
          aria-invalid={state === "error" ? true : undefined}
          aria-describedby={state === "error" && error ? `${id}-error` : undefined}
          onChange={(e) => handleChange(e.target.value)}
        />
        <div className="otp__boxes" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span key={i} className="otp__box" data-filled={i < value.length ? "true" : undefined} data-active={i === active ? "true" : undefined} style={{ "--i": i } as CSSProperties}>
              <span className="otp__digit">{value[i] ?? ""}</span>
            </span>
          ))}
        </div>
        <svg ref={checkRef} className="otp__check" viewBox="0 0 24 24" width="44" height="44" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {state === "error" && error ? (
        <p id={`${id}-error`} className="otp__error">
          {error}
        </p>
      ) : null}
      <LiveRegion message={announce} />
    </div>
  );
}
