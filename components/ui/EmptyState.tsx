import type { ReactNode } from "react";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export interface EmptyStateProps {
  title: string;
  /** Say why it is empty and what happens next. Never lorem ipsum, never a fake call to action. */
  children: ReactNode;
  icon?: IconName;
  /** A real action, or nothing. */
  action?: ReactNode;
}

export function EmptyState({ title, children, icon = "inbox", action }: EmptyStateProps) {
  return (
    <div className="empty">
      <Icon name={icon} className="empty__icon" />
      <p className="empty__title">{title}</p>
      <p className="empty__body">{children}</p>
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
