import type { ReactNode } from "react";
import { StateView } from "@/components/ui";

/**
 * The dashboard's empty and error states, built on the shared StateView so there is one look for them across the app.
 * Errors keep the pack rule: every failure says what failed, whether money moved, what to do and whether retrying is safe.
 */

export interface EmptyStateProps {
  title: string;
  /** Say why it is empty and what happens next. Never lorem ipsum, never a fake call to action. */
  children: ReactNode;
  /** A real action, or nothing. */
  action?: ReactNode;
  /** Smaller layout for use inside a card. */
  compact?: boolean;
}

export function EmptyState({ title, children, action, compact }: EmptyStateProps) {
  return (
    <StateView tone="empty" title={title} action={action} compact={compact} headingLevel={compact ? 3 : 2}>
      {children}
    </StateView>
  );
}

export interface ErrorStateProps {
  title: string;
  /** What failed. */
  message: string;
  /** Whether money moved. Required: every failure must say. */
  moneyLine: string;
  /** What to do next and whether retrying is safe. */
  action: string;
  /** Short correlation id the person can quote to support. */
  reference?: string;
  /** A real retry control, or nothing. */
  retry?: ReactNode;
  /** Smaller layout for use inside a card. */
  compact?: boolean;
}

export function ErrorState({ title, message, moneyLine, action, reference, retry, compact }: ErrorStateProps) {
  return (
    <StateView tone="error" title={title} action={retry} compact={compact} headingLevel={compact ? 3 : 2}>
      {message} {moneyLine} {action}
      {reference ? ` Reference ${reference}.` : ""}
    </StateView>
  );
}
