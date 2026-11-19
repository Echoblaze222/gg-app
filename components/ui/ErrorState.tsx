import type { ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";

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
  /** A real retry control (a client component), or nothing. */
  retry?: ReactNode;
}

/** Failure that explains itself (pack rule): what failed, whether money moved, what to do, whether retry is safe. */
export function ErrorState({ title, message, moneyLine, action, reference, retry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <StatusIcon tone="error" className="error-state__icon" />
      <div className="error-state__text">
        <p className="error-state__title">{title}</p>
        <p>{message}</p>
        <p>{moneyLine}</p>
        <p>{action}</p>
        {reference ? <p className="error-state__ref">Reference {reference}</p> : null}
        {retry ? <div className="error-state__retry">{retry}</div> : null}
      </div>
    </div>
  );
}
