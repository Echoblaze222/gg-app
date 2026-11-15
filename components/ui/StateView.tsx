import type { ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";
import { InboxIcon } from "./icons";
import { cx } from "./cx";

export type StateTone = "empty" | "error" | "success";

export interface StateViewProps {
  tone: StateTone;
  /** Short and specific. Say what is empty, what failed, or what is done. */
  title: string;
  /** What happened and what to do next. For errors, say whether money moved where it applies. */
  children?: ReactNode;
  /** One clear next step, usually a Button or LinkButton. */
  action?: ReactNode;
  /** Heading level for the title so the page outline stays correct. Default 2. */
  headingLevel?: 2 | 3 | 4;
  /** Smaller layout for use inside a card or table. */
  compact?: boolean;
  className?: string;
}

function Icon({ tone }: { tone: StateTone }) {
  if (tone === "error") return <StatusIcon tone="error" className="state__icon" />;
  if (tone === "success") return <StatusIcon tone="success" className="state__icon" />;
  return <InboxIcon className="state__icon" />;
}

/**
 * Full or inline state for a screen or card: empty, error, success.
 * Errors are announced right away (role alert), success politely (role status), empty is plain content.
 * Icon shape differs per tone, so meaning never depends on color.
 */
export function StateView({ tone, title, children, action, headingLevel = 2, compact, className }: StateViewProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const role = tone === "error" ? "alert" : tone === "success" ? "status" : undefined;
  return (
    <section role={role} className={cx("state", `state--${tone}`, compact && "state--compact", className)}>
      <span className="state__badge">
        <Icon tone={tone} />
      </span>
      <Heading className="state__title">{title}</Heading>
      {children ? <p className="state__text">{children}</p> : null}
      {action ? <div className="state__action">{action}</div> : null}
    </section>
  );
}

export type StateShortcutProps = Omit<StateViewProps, "tone">;

export function EmptyState(props: StateShortcutProps) {
  return <StateView tone="empty" {...props} />;
}

export function ErrorState(props: StateShortcutProps) {
  return <StateView tone="error" {...props} />;
}

export function SuccessState(props: StateShortcutProps) {
  return <StateView tone="success" {...props} />;
}
