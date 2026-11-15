"use client";

import { LiveRegion } from "@/components/motion/LiveRegion";
import { useDelayedFlag, useReducedMotion } from "@/lib/motion";
import { StatusIcon } from "./StatusIcon";
import { cx } from "./cx";

export type RingStatus = "idle" | "loading" | "success" | "failure";

export interface ProgressRingProps {
  /** A real ratio only, for example members paid out of members expected. */
  value: number;
  max?: number;
  /** What the ring measures, read by screen readers, for example "Cycle collection". */
  label: string;
  /** Small text under the percentage, for example "42 of 60 paid". */
  caption?: string;
  size?: "md" | "lg";
  /** The parent says what is happening. The ring never decides success from the number alone. */
  status?: RingStatus;
  loadingLabel?: string;
  successLabel?: string;
  failureLabel?: string;
  className?: string;
}

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function toRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function ProgressRing({
  value,
  max = 100,
  label,
  caption,
  size = "md",
  status = "idle",
  loadingLabel = "Loading",
  successLabel = "Complete",
  failureLabel = "Could not load",
  className,
}: ProgressRingProps) {
  const reduced = useReducedMotion();
  const loading = status === "loading";
  const showLoader = useDelayedFlag(loading);
  const ratio = toRatio(value, max);
  const percent = Math.round(ratio * 100);
  const announcement = loading ? loadingLabel : status === "success" ? successLabel : status === "failure" ? failureLabel : "";

  const progressProps =
    status === "idle" || status === "success"
      ? { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": percent, "aria-valuetext": `${percent} percent` }
      : { role: "img" as const };

  return (
    <div className={cx("ring", `ring--${size}`, className)} data-status={status === "idle" ? undefined : status} data-motion={reduced ? "reduced" : undefined}>
      <div className="ring__figure" aria-label={label} aria-busy={loading || undefined} {...progressProps}>
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="ring__track" cx="50" cy="50" r={RADIUS} />
          {loading ? (
            showLoader ? <circle className="ring__spin" cx="50" cy="50" r={RADIUS} strokeDasharray={`${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE}`} /> : null
          ) : status === "failure" ? null : (
            <circle
              className="ring__value"
              cx="50"
              cy="50"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
            />
          )}
        </svg>
        <span className="ring__center" aria-hidden="true">
          {status === "failure" ? (
            <StatusIcon tone="error" className="ring__icon" />
          ) : loading ? null : (
            <>
              <span className="ring__percent">{percent}%</span>
              {status === "success" ? <StatusIcon tone="success" className="ring__icon" /> : null}
            </>
          )}
        </span>
      </div>
      {caption ? <p className="ring__caption">{caption}</p> : null}
      <LiveRegion message={announcement} />
    </div>
  );
}
