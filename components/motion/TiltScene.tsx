"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

export interface TiltSceneProps {
  children: ReactNode;
  /** Largest tilt in degrees on each axis. Default 8. */
  maxTilt?: number;
  className?: string;
}

/**
 * A 3D stage. Children placed inside can sit at different depths with `translate3d(0, 0, var(--z))`
 * (see the `.depth` class in `styles/components/tilt.css`). The stage leans toward the pointer.
 *
 * - Pure decoration: it holds no state that matters and announces nothing.
 * - With reduced motion it does not tilt at all, and the float animations in the CSS are switched off.
 * - Tilt is set through CSS variables inside a requestAnimationFrame loop, so React never re-renders while the pointer moves.
 */
export function TiltScene({ children, maxTilt = 8, className = "" }: TiltSceneProps) {
  const outer = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = outer.current;
    const stage = scene.current;
    if (!host || !stage || reduced) {
      return;
    }
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const tick = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      stage.style.setProperty("--tilt-x", `${currentX.toFixed(2)}deg`);
      stage.style.setProperty("--tilt-y", `${currentY.toFixed(2)}deg`);
      const settled = Math.abs(targetX - currentX) < 0.02 && Math.abs(targetY - currentY) < 0.02;
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(tick);
      }
    };
    const onMove = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        return;
      }
      const px = (event.clientX - box.left) / box.width - 0.5;
      const py = (event.clientY - box.top) / box.height - 0.5;
      targetY = Math.max(-1, Math.min(1, px * 2)) * maxTilt;
      targetX = -Math.max(-1, Math.min(1, py * 2)) * maxTilt;
      kick();
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      kick();
    };

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [reduced, maxTilt]);

  return (
    <div ref={outer} className={`tilt ${className}`}>
      <div ref={scene} className="tilt__scene">
        {children}
      </div>
    </div>
  );
}
