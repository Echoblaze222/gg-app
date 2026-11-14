import type { ComponentProps, ReactNode } from "react";
import { StatusIcon } from "./StatusIcon";
import type { Tone } from "./StatusIcon";
import { cx } from "./cx";

export interface AlertProps extends Omit<ComponentProps<"div">, "title" | "children"> {
  tone?: Tone;
  title?: string;
  /** Show a close button. The parent hides the alert. */
  onDismiss?: () => void;
  children: ReactNode;
}

/** Inline message. Errors are announced right away, the other tones politely. */
export function Alert({ tone = "info", title, onDismiss, className, children, ...rest }: AlertProps) {
  return (
    <div {...rest} role={tone === "error" ? "alert" : "status"} className={cx("alert", `alert--${tone}`, className)}>
      <StatusIcon tone={tone} className="alert__icon" />
      <div className="alert__body">
        {title ? <p className="alert__title">{title}</p> : null}
        <div className="alert__text">{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Dismiss message">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="20" height="20">
            <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
