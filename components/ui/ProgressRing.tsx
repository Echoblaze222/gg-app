import { cx } from "./cx";

export interface ProgressRingProps {
  /** A real ratio from 0 to 1. Values outside the range are clamped. Never pass a made up number. */
  value: number;
  /** Text read by screen readers and shown beside the ring by the caller, for example "4 of 6 paid". */
  label: string;
  size?: number;
  className?: string;
}

/** Circular progress. Shows a ratio that has a defined formula. Color is never the only signal: the label carries the meaning. */
export function ProgressRing({ value, label, size = 64, className }: ProgressRingProps) {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={cx("ring", className)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className="ring__value"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
