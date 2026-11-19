"use client";

import type { CSSProperties, ReactNode } from "react";
import { LiveRegion } from "@/components/motion/LiveRegion";
import { useDelayedFlag } from "@/lib/motion";
import { cx } from "./cx";

export interface SkeletonProps {
  shape?: "line" | "block" | "circle";
  /** CSS length, or a number of pixels. */
  width?: string | number;
  height?: string | number;
  className?: string;
}

/** Decorative placeholder. Wrap several in SkeletonGroup so loading is announced once. */
export function Skeleton({ shape = "line", width, height, className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return <span aria-hidden="true" className={cx("skeleton", `skeleton--${shape}`, className)} style={style} />;
}

/** Shows its placeholders only after 300 ms, so fast loads never flash them, then announces `label` once. */
export function SkeletonGroup({ label, delayMs, children, className }: { label: string; delayMs?: number; children: ReactNode; className?: string }) {
  const visible = useDelayedFlag(true, delayMs);
  return (
    <div aria-busy="true" className={className}>
      <LiveRegion message={visible ? label : ""} />
      {visible ? children : null}
    </div>
  );
}
