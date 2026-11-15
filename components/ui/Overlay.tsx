"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";
import { LiveRegion } from "@/components/motion/LiveRegion";
import { CloseIcon } from "./icons";
import { cx } from "./cx";

export interface OverlayBaseProps {
  open: boolean;
  onClose: () => void;
  /** Visible title, also the accessible name of the dialog. */
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row, pinned to the bottom of the panel. */
  footer?: ReactNode;
  /**
   * True while something is in flight (a payment, a save). Escape, the backdrop and the close button stop working,
   * so the person cannot walk away from a half finished action. The parent sets it, never the overlay.
   */
  busy?: boolean;
  /** Announced when `busy` turns on, for example "Confirming your payment". */
  busyLabel?: string;
  closeLabel?: string;
  className?: string;
}

interface OverlayProps extends OverlayBaseProps {
  kind: "modal" | "sheet";
  side?: "bottom" | "end";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const subscribeNone = () => () => {};

/** Shared engine for Modal and Sheet: portal, focus trap, Escape, scroll lock, focus return. */
export function Overlay({
  kind,
  side = "bottom",
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  busyLabel = "Working",
  closeLabel = "Close",
  className,
}: OverlayProps) {
  const mounted = useSyncExternalStore(subscribeNone, () => true, () => false);
  const reduced = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  // Move focus in, lock page scroll, give focus back on close.
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!busyRef.current) onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className={cx("overlay", `overlay--${kind}`, kind === "sheet" && `overlay--${side}`)}
      data-motion={reduced ? "reduced" : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        className="overlay__backdrop"
        data-testid="overlay-backdrop"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={cx("overlay__panel", className)}
      >
        {kind === "sheet" ? <span className="overlay__grabber" aria-hidden="true" /> : null}
        <header className="overlay__header">
          <h2 id={titleId} className="overlay__title">
            {title}
          </h2>
          <button type="button" className="overlay__close" aria-label={closeLabel} disabled={busy} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {description ? (
          <p id={descId} className="overlay__description">
            {description}
          </p>
        ) : null}
        <div className="overlay__body">{children}</div>
        {footer ? <footer className="overlay__footer">{footer}</footer> : null}
        <LiveRegion message={busy ? busyLabel : ""} />
      </div>
    </div>,
    document.body,
  );
}

export type ModalProps = OverlayBaseProps;
export type SheetProps = OverlayBaseProps & { side?: "bottom" | "end" };

/** Centered dialog for a decision or a short form. */
export function Modal(props: ModalProps) {
  return <Overlay kind="modal" {...props} />;
}

/** Bottom sheet on phones (slides up), side panel when `side="end"` on wide screens. Use for longer tasks and menus. */
export function Sheet({ side = "bottom", ...props }: SheetProps) {
  return <Overlay kind="sheet" side={side} {...props} />;
}
