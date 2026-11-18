"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { LiveRegion } from "./LiveRegion";

/**
 * The receipt printer (RESEARCH.md 4.6). A compact printer feeds a paper receipt out of its slot line by line,
 * the amount settles in, the "Verified" stamp lands, the paper detaches and the action buttons rise in.
 *
 * It only draws. It never decides anything: `state` and `verified` come from the server.
 *   idle      nothing printed yet
 *   printing  the receipt is being generated and shown
 *   printed   finished (also the instant, no animation view when `instant` is set)
 *   failed    the receipt could not be generated: a calm paper jam with a Retry button
 * The stamp is drawn only when `verified` is true. With reduced motion the finished receipt appears at once.
 */

export type ReceiptPrinterState = "idle" | "printing" | "printed" | "failed";

export interface ReceiptLine {
  label: string;
  value: string;
}

export interface ReceiptPrinterProps {
  state: ReceiptPrinterState;
  /** True only when the server confirmed the payment. Decides whether the Verified stamp is drawn. */
  verified: boolean;
  /** Amount already formatted for display, for example "NGN 5,000.00". */
  amount: string;
  lines: readonly ReceiptLine[];
  /** Receipt reference printed at the bottom of the paper. */
  reference?: string;
  /** Show the finished receipt at once, with no animation (reopening a receipt). */
  instant?: boolean;
  /** Called once when the print finished. Also called at once when motion is reduced. */
  onPrinted?: () => void;
  onRetry?: () => void;
  /** When given, a Replay button shows on a finished receipt. The parent remounts or flips state to play it again. */
  onReplay?: () => void;
  /** Buttons that rise in after printing, for example Download and Share. */
  children?: ReactNode;
  /** Words for people and screen readers. Defaults are plain English. */
  messages?: Partial<Record<"printing" | "printed" | "verified" | "failed" | "idle", string>>;
}

const DEFAULT_MESSAGES = {
  idle: "Your receipt will appear here.",
  printing: "Printing your receipt.",
  printed: "Your receipt is ready.",
  verified: "Your receipt is ready and the payment is verified.",
  failed: "The receipt could not be generated. This does not change your payment. You can try again.",
} as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ReceiptPrinter({
  state,
  verified,
  amount,
  lines,
  reference,
  instant = false,
  onPrinted,
  onRetry,
  onReplay,
  children,
  messages,
}: ReceiptPrinterProps) {
  const words = { ...DEFAULT_MESSAGES, ...messages };
  const donePrinting = useRef(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const onPrintedRef = useRef(onPrinted);
  useEffect(() => {
    onPrintedRef.current = onPrinted;
  });

  useEffect(() => {
    if (state !== "printing") {
      donePrinting.current = false;
      return;
    }
    // No animation will run, so nothing would ever tell us it finished.
    if (prefersReducedMotion() && !donePrinting.current) {
      donePrinting.current = true;
      onPrinted?.();
    }
  }, [state, onPrinted]);

  const finishedView = state === "printed" || instant;
  const shown = state === "failed" ? "failed" : instant ? "printed" : state;
  const status =
    shown === "failed" ? words.failed : shown === "printing" ? words.printing : shown === "printed" ? (verified ? words.verified : words.printed) : words.idle;

  // A native listener: the last animation of the print (the detach) tells us the print is finished.
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const onEnd = (e: Event) => {
      if ((e as AnimationEvent).animationName === "printer-detach" && !donePrinting.current) {
        donePrinting.current = true;
        onPrintedRef.current?.();
      }
    };
    paper.addEventListener("animationend", onEnd);
    return () => paper.removeEventListener("animationend", onEnd);
  }, []);

  return (
    <figure className="printer" data-state={shown} data-instant={instant ? "true" : undefined} data-verified={verified ? "true" : "false"}>
      <div className="printer__stage" aria-hidden="true">
        <div className="printer__body">
          <span className="printer__light" />
          <span className="printer__slot" />
        </div>
        <div className="printer__window">
          <div className="printer__paper" ref={paperRef}>
            <p className="printer__brand">GG Contribution</p>
            <p className="printer__kind">Receipt</p>
            <dl className="printer__lines">
              {lines.map((line, i) => (
                <div key={line.label} className="printer__line" style={{ "--i": i } as CSSProperties}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            <p className="printer__amount">{amount}</p>
            {reference ? <p className="printer__ref">{reference}</p> : null}
            {verified ? <span className="printer__stamp">Verified</span> : null}
            <span className="printer__tear" />
          </div>
        </div>
      </div>

      <figcaption className="printer__status">{status}</figcaption>
      <LiveRegion message={shown === "idle" ? "" : status} />

      {shown === "failed" && onRetry ? (
        <div className="printer__actions printer__actions--now">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {finishedView && (children || onReplay) ? (
        <div className="printer__actions">
          {children}
          {onReplay ? (
            <Button variant="quiet" onClick={onReplay}>
              Replay
            </Button>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
