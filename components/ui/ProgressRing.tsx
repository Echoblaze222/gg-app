import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ProgressRingProps {
  /** 0 to 100. Values outside are clamped. */
  value: number;
  /** Required. Says what is progressing, for example "Contribution progress". */
  label: string;
  /** Spoken value, for example "NGN 25,000 of 50,000". Falls back to the percentage. */
  valueText?: string;
  /** Pixel size of the ring. */
  size?: number;
  /** Visible content in the middle, for example the percentage. */
  children?: ReactNode;
  className?: string;
}

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProgressRing({ value, label, valueText, size = 120, children, className }: ProgressRingProps) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={valueText ?? `${Math.round(clamped)} percent`}
      className={cx("ring", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="ring__svg">
        <circle className="ring__track" cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" />
        <circle
          className="ring__arc"
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      {children ? <div className="ring__center">{children}</div> : null}
    </div>
  );
}
