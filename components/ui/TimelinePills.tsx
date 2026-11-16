import { cx } from "./cx";

export type StepState = "done" | "current" | "upcoming" | "failed";

export interface TimelineStep {
  id: string;
  label: string;
  state: StepState;
}

const stateText: Record<StepState, string> = {
  done: "Completed",
  current: "Current step",
  upcoming: "Not reached yet",
  failed: "Failed",
};

function StepIcon({ state }: { state: StepState }) {
  const common = { viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const, width: 16, height: 16, className: "pills__icon" };
  const stroke = { stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (state === "done")
    return (
      <svg {...common}>
        <path d="M3.5 8.5l3 3 6-7" {...stroke} />
      </svg>
    );
  if (state === "failed")
    return (
      <svg {...common}>
        <path d="M4 4l8 8M12 4l-8 8" {...stroke} />
      </svg>
    );
  if (state === "current")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.5" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="3.5" {...stroke} />
    </svg>
  );
}

/** Steps of a process (a payment, a withdrawal). The caller maps server status to step states, this only draws them. */
export function TimelinePills({ steps, label, className }: { steps: TimelineStep[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cx("pills", className)}>
      {steps.map((step) => (
        <li key={step.id} className={cx("pills__item", `pills__item--${step.state}`)} aria-current={step.state === "current" ? "step" : undefined}>
          <StepIcon state={step.state} />
          <span>{step.label}</span>
          <span className="sr-only">{`, ${stateText[step.state]}`}</span>
        </li>
      ))}
    </ol>
  );
}
