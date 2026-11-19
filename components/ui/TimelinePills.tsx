import type { ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";
import type { Tone } from "./StatusIcon";
import { cx } from "./cx";

export type TimelineStatus = "paid" | "due" | "overdue" | "upcoming" | "missed";

export interface TimelineItem {
  id: string;
  /** Visible date text, for example "Sat 21 Nov". */
  date: string;
  /** Visible amount or title. */
  title: ReactNode;
  status: TimelineStatus;
}

const META: Record<TimelineStatus, { text: string; tone: Tone | null }> = {
  paid: { text: "Paid", tone: "success" },
  due: { text: "Due", tone: "pending" },
  overdue: { text: "Overdue", tone: "error" },
  upcoming: { text: "Upcoming", tone: null },
  missed: { text: "Missed", tone: "warning" },
};

/**
 * Contribution schedule as pills on a line. Vertical on phones, so nothing scrolls sideways.
 * Every status has a text label and a distinct shape, never color alone. The black pill marks the entry that needs attention now.
 */
export function TimelinePills({ items, label }: { items: readonly TimelineItem[]; label: string }) {
  return (
    <ol className="timeline" aria-label={label}>
      {items.map((item) => {
        const meta = META[item.status];
        const focus = item.status === "due" || item.status === "overdue";
        return (
          <li key={item.id} className="timeline__item">
            <span className="timeline__date">{item.date}</span>
            <span className={cx("timeline__pill", `timeline__pill--${item.status}`, focus && "timeline__pill--focus")} data-surface={focus ? "ink" : undefined}>
              {meta.tone ? <StatusIcon tone={meta.tone} className="timeline__icon" /> : <span className="timeline__dot" aria-hidden="true" />}
              <span className="timeline__title">{item.title}</span>
              <span className="timeline__status">{meta.text}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
