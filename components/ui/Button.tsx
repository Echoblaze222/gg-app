"use client";

import type { ComponentProps, ReactNode } from "react";
import { useDelayedFlag, useReducedMotion } from "@/lib/motion";
import { LiveRegion } from "@/components/motion/LiveRegion";
import { cx } from "./cx";

/** What the parent says is happening. The button never decides this itself, especially never success. */
export type ActionStatus = "idle" | "loading" | "success" | "failure";

export interface ButtonProps extends Omit<ComponentProps<"button">, "children"> {
  variant?: "primary" | "secondary" | "accent" | "quiet";
  size?: "md" | "lg";
  status?: ActionStatus;
  /** Text shown and announced while loading, for example "Signing in". */
  loadingLabel?: string;
  /** Text shown and announced on success, for example "Signed in". Only pass success after the server confirmed it. */
  successLabel?: string;
  /** Text shown and announced on failure. Say what happened and whether money moved where it applies. */
  failureLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Gallery only: draws a state without a pointer. */
  preview?: "hover" | "pressed" | "focus";
  children: ReactNode;
}

function CheckIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg className="btn__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  status = "idle",
  loadingLabel = "Working",
  successLabel = "Done",
  failureLabel = "Did not complete. Try again.",
  leadingIcon,
  trailingIcon,
  preview,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const reduced = useReducedMotion();
  const loading = status === "loading";
  const showSpinner = useDelayedFlag(loading);
  // Loading and success lock the button. Failure stays pressable so the person can retry.
  const locked = loading || status === "success";

  const label = loading ? loadingLabel : status === "success" ? successLabel : status === "failure" ? failureLabel : children;
  const announcement = status === "idle" ? "" : (label as string);

  return (
    <>
      <button
        {...rest}
        type={type}
        className={cx("btn", `btn--${variant}`, size === "lg" && "btn--lg", className)}
        data-status={status === "idle" ? undefined : status}
        data-motion={reduced ? "reduced" : undefined}
        data-preview={preview}
        aria-busy={loading || undefined}
        aria-disabled={locked || undefined}
        onClick={(event) => {
          if (locked) {
            // Blocks double submits while a request is in flight.
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {loading ? showSpinner && <span className="btn__spinner" aria-hidden="true" /> : null}
        {status === "success" ? <CheckIcon /> : null}
        {status === "failure" ? <CrossIcon /> : null}
        {status === "idle" ? leadingIcon : null}
        <span>{label}</span>
        {status === "idle" ? trailingIcon : null}
      </button>
      <LiveRegion message={announcement} />
    </>
  );
}
