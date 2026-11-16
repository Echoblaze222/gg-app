"use client";

import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode, SyntheticEvent } from "react";
import { cx } from "./cx";

export interface DialogProps {
  open: boolean;
  /** Called for every way of closing: close button, Escape, backdrop click. The parent sets `open` to false. */
  onClose: () => void;
  /** Required. Labels the dialog for screen readers. */
  title: string;
  description?: string;
  variant?: "modal" | "sheet";
  /** Set false while something must not be interrupted, for example a payment in flight. */
  dismissible?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Modal or bottom sheet on the native dialog element (docs/design/decisions/004-dialog-native.md).
 * The browser provides focus trapping, Escape, the inert page behind, and focus return.
 */
export function Dialog({ open, onClose, title, description, variant = "modal", dismissible = true, children, className }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  const ref = useRef<HTMLDialogElement>(null);

  // Keep the native dialog in step with `open`.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.hasAttribute("open")) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.hasAttribute("open")) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  // Lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute("data-scroll-locked", "true");
    return () => root.removeAttribute("data-scroll-locked");
  }, [open]);

  // Escape fires "cancel". Blocking it keeps a non dismissible dialog open.
  const handleCancel = (event: SyntheticEvent) => {
    if (!dismissible) event.preventDefault();
  };

  // The native "close" event also fires when we call close() ourselves. Only react while the parent still says open.
  const handleClose = () => {
    if (open) onClose();
  };

  // A click on the backdrop lands on the dialog element itself, never on the panel inside it.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (dismissible && event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={cx("dialog", `dialog--${variant}`, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleClose}
      onClick={handleClick}
    >
      <div className="dialog__panel">
        {open ? (
          <>
            <div className="dialog__header">
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {dismissible ? (
                <button type="button" className="dialog__close" onClick={onClose} aria-label="Close">
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="20" height="20">
                    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
            {description ? (
              <p id={descriptionId} className="dialog__description">
                {description}
              </p>
            ) : null}
            <div className="dialog__body">{children}</div>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
