"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MOTION_MS } from "@/lib/motion";
import { StatusIcon } from "./StatusIcon";
import type { Tone } from "./StatusIcon";

export const MAX_VISIBLE_TOASTS = 3;
export const DEFAULT_TOAST_MS = 5000;

export interface ToastOptions {
  tone?: Tone;
  title: string;
  message?: string;
  /** Milliseconds before it closes. `null` keeps it until dismissed. Errors default to `null`. */
  durationMs?: number | null;
  action?: { label: string; onClick: () => void };
}

interface ToastItem {
  id: string;
  tone: Tone;
  title: string;
  message?: string;
  durationMs: number | null;
  action?: ToastOptions["action"];
}

interface ToastApi {
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>. Add the provider once in the app shell.");
  return api;
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(item.durationMs);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => {
    setLeaving(true);
    leaveTimer.current = setTimeout(() => onDismiss(item.id), MOTION_MS.fast);
  }, [item.id, onDismiss]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // The countdown stops while the toast is hovered or focused and resumes with the time that was left.
  useEffect(() => {
    if (item.durationMs === null || paused || leaving || remaining.current === null) return;
    const startedAt = Date.now();
    const id = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, (remaining.current ?? 0) - (Date.now() - startedAt));
    };
  }, [paused, leaving, close, item.durationMs]);

  return (
    <li
      className={`toast toast--${item.tone}`}
      role={item.tone === "error" ? "alert" : undefined}
      data-leaving={leaving ? "true" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <StatusIcon tone={item.tone} className="toast__icon" />
      <div className="toast__body">
        <p className="toast__title">{item.title}</p>
        {item.message ? <p className="toast__message">{item.message}</p> : null}
        {item.action ? (
          <button
            type="button"
            className="toast__action"
            onClick={() => {
              item.action?.onClick();
              close();
            }}
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button type="button" className="toast__close" onClick={close} aria-label="Dismiss notification">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="20" height="20">
          <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => setItems((current) => current.filter((t) => t.id !== id)), []);

  const show = useCallback((options: ToastOptions) => {
    const tone = options.tone ?? "info";
    const id = `toast-${++counter.current}`;
    const durationMs = options.durationMs !== undefined ? options.durationMs : tone === "error" ? null : DEFAULT_TOAST_MS;
    setItems((current) => [...current, { id, tone, title: options.title, message: options.message, durationMs, action: options.action }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        <ol className="toast-list" aria-live="polite">
          {items.slice(0, MAX_VISIBLE_TOASTS).map((item) => (
            <ToastView key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}
