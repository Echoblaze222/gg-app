"use client";

import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import { LiveRegion } from "@/components/motion/LiveRegion";
import { cx } from "./cx";

export interface InputProps extends Omit<ComponentProps<"input">, "placeholder" | "prefix" | "size"> {
  /** Visible label. Required: a field without a label is not accessible. */
  label: string;
  /** Helper text under the field. */
  hint?: string;
  /** What is wrong and how to fix it. When set the field shows the error state. */
  error?: string;
  /** Content before the text, for example a country code. */
  prefix?: ReactNode;
  /** Content after the text, for example a show password button. */
  trailing?: ReactNode;
  /** Gallery only: draws a state without a pointer. */
  preview?: "hover" | "focus";
}

function AlertIcon() {
  return (
    <svg className="field__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 5.75v5M10 13.75v.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function Input({ label, hint, error, prefix, trailing, preview, id, className, disabled, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null, rest["aria-describedby"]].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("field", className)} data-invalid={error ? "true" : undefined} data-disabled={disabled ? "true" : undefined}>
      <div className="field__control" data-preview={preview} data-has-prefix={prefix ? "true" : undefined}>
        {prefix ? <span className="field__prefix">{prefix}</span> : null}
        <input
          {...rest}
          id={inputId}
          className="field__input"
          // A single space keeps :placeholder-shown working so the label can float without script.
          placeholder=" "
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <label htmlFor={inputId} className="field__label">
          {label}
        </label>
        {trailing ? <span className="field__trailing">{trailing}</span> : null}
      </div>
      {error ? (
        <p id={errorId} className="field__message field__message--error">
          <AlertIcon />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="field__message">
          {hint}
        </p>
      ) : null}
      <LiveRegion message={error ?? ""} />
    </div>
  );
}
