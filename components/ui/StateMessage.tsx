import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleIcon, InboxIcon, WifiOffIcon } from "./icons";
import { cx } from "./cx";

export type StateKind = "empty" | "error" | "offline" | "success";

export interface StateMessageProps {
  kind: StateKind;
  title: string;
  /** What happened and what to do next. For errors, say whether money moved. */
  message?: string;
  /** A Button or LinkButton for the next step. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}

const icons = { empty: InboxIcon, error: AlertTriangleIcon, offline: WifiOffIcon, success: CheckCircleIcon } as const;

/** Whole-section state: nothing here yet, something went wrong, no connection, or done. Page content, not a live announcement. */
export function StateMessage({ kind, title, message, action, headingLevel = 2, className }: StateMessageProps) {
  const Icon = icons[kind];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={cx("state", `state--${kind}`, className)}>
      <span className="state__icon">
        <Icon width={32} height={32} />
      </span>
      <Heading className="state__title">{title}</Heading>
      {message ? <p className="state__message">{message}</p> : null}
      {action ? <div className="state__action">{action}</div> : null}
    </section>
  );
}
