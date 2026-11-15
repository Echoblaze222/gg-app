"use client";

import type { ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";
import { cx } from "./cx";

export type TimelineStatus = "paid" | "upcoming" | "pending" | "overdue";

export interface TimelineItem {
  id: string;
  /** Already formatted by the caller, for example "5 Dec". */
  date: string;
  /** What it is, for example "Instalment 3" or an amount the caller formatted. */
  label: ReactNode;
  status: TimelineStatus;
  /** The next thing due. Drawn as the black pill, only one should be set. */
  current?: boolean;
  disabled?: boolean;
  /** Gallery only: draws a state without a pointer. */
  preview?: "hover" | "pressed" | "focus";
}

export interface TimelinePillsProps {
  /** Accessible name of the list, for example "Contribution schedule". */
  label: string;
  items: TimelineItem[];
  /** Makes each pill a button. Without it the pills are plain list items. */
  onSelect?: (id: string) => void;
  /** Replace the default English status words. */
  statusLabels?: Partial<Record<TimelineStatus, string>>;
  className?: string;
}

const DEFAULT_LABELS: Record<TimelineStatus, string> = {
  paid: "Paid",
  upcoming: "Upcoming",
  pending: "Pending",
  overdue: "Overdue",
};

function UpcomingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="pill__icon">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.75" strokeDasharray="3 3" />
    </svg>
  );
}

function PillIcon({ status }: { status: TimelineStatus }) {
  if (status === "upcoming") return <UpcomingIcon />;
  const tone = status === "paid" ? "success" : status === "overdue" ? "error" : "pending";
  return <StatusIcon tone={tone} className="pill__icon" />;
}

/**
 * Contribution schedule as pills. A row with connectors from 768 px, a vertical list below.
 * Status is an icon and a word on every pill, never color alone. The pill for the next due item is black.
 */
export function TimelinePills({ label, items, onSelect, statusLabels, className }: TimelinePillsProps) {
  const words = { ...DEFAULT_LABELS, ...statusLabels };
  return (
    <ol aria-label={label} className={cx("timeline", className)}>
      {items.map((item) => {
        const body = (
          <>
            <PillIcon status={item.status} />
            <span className="pill__text">
              <span className="pill__date">{item.date}</span>
              <span className="pill__label">{item.label}</span>
              <span className="pill__status">{words[item.status]}</span>
            </span>
          </>
        );
        const common = {
          className: "pill",
          "data-status": item.status,
          "data-current": item.current ? "true" : undefined,
          "data-preview": item.preview,
        };
        return (
          <li key={item.id} className="timeline__item" aria-current={item.current ? "step" : undefined}>
            {onSelect && !item.disabled ? (
              <button type="button" {...common} onClick={() => onSelect(item.id)}>
                {body}
              </button>
            ) : (
              <div {...common} aria-disabled={item.disabled || undefined}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
