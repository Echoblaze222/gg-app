"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

export interface TurntableProps {
  /** Sprite sheet: every frame of one full turn, left to right then top to bottom. */
  src: string;
  frames: number;
  columns: number;
  rows: number;
  /** Size in pixels of one frame in the sheet. Sets the aspect ratio. */
  frameWidth: number;
  frameHeight: number;
  /** Small stand in for frame 0, shown until the sheet has loaded. */
  poster?: string;
  /** Which way the object faces in frame 0, in radians. Lets the floor shadow follow the real orientation. */
  startYaw?: number;
  /** Accessible name, for example "Glass piggy bank". */
  label: string;
  /** Turn slowly when nobody is touching it. Ignored with reduced motion. Default true. */
  autoRotate?: boolean;
  /** Draw the turntable platform and the floor shadow. Default true. */
  stage?: boolean;
  /** Largest width in CSS pixels. Default 460. */
  maxWidth?: number;
  className?: string;
  /**
   * Decoration that should turn with the object, for example OrbitObjects. It is placed in the same 3D space.
   * The viewer sets the CSS variable --spin (degrees turned so far) on itself, and children can read it.
   */
  children?: ReactNode;
}

const AUTO_FRAMES_PER_SECOND = 0.5;
const IDLE_BEFORE_AUTO_MS = 2200;

const wrap = (value: number, size: number) => ((value % size) + size) % size;

/**
 * A 360 degree viewer for a pre rendered 3D object.
 *
 * - Drag or swipe sideways to turn it. It keeps a little momentum after release.
 * - Left and right arrow keys step one frame. It is a slider for assistive technology.
 * - Neighbouring frames are cross faded, so slow turning looks smooth with only a few frames.
 * - Vertical swipes still scroll the page (touch-action: pan-y).
 * - Reduced motion: no automatic turning and no momentum. The person can still turn it themselves.
 * - Work only runs while it is on screen and the tab is visible. React never re renders while it turns.
 */
export function Turntable({
  src,
  frames,
  columns,
  rows,
  frameWidth,
  frameHeight,
  poster,
  startYaw = 0,
  label,
  autoRotate = true,
  stage = true,
  maxWidth = 460,
  className = "",
  children,
}: TurntableProps) {
  const root = useRef<HTMLDivElement>(null);
  const layerA = useRef<HTMLDivElement>(null);
  const layerB = useRef<HTMLDivElement>(null);
  const ticks = useRef<SVGEllipseElement>(null);
  const reduced = useReducedMotion();
  const gradientId = useId();
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);

  const state = useRef({
    pos: 0,
    velocity: 0,
    target: null as number | null,
    dragging: false,
    lastX: 0,
    lastT: 0,
    lastInput: -Infinity,
    visible: true,
    running: false,
    raf: 0,
    drawnFrame: -1,
    drawnMix: -1,
    drawnStamp: -1,
    drawnSpin: -1,
  });
  const api = useRef<{ kick: () => void }>({ kick: () => {} });

  /* Load the full sheet in the background. */
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.src = src;
    const done = () => {
      if (!cancelled) {
        setReady(true);
      }
    };
    // If the sheet cannot be loaded the poster stays, so the page never shows a broken image.
    if (typeof image.decode === "function") {
      image.decode().then(done, () => {});
    } else {
      image.onload = done;
    }
    return () => {
      cancelled = true;
    };
  }, [src]);

  /* The sheet replaced the poster: force the next draw to place both layers again. */
  useEffect(() => {
    state.current.drawnFrame = -1;
    state.current.drawnMix = -1;
    state.current.drawnStamp = -1;
    state.current.drawnSpin = -1;
    api.current.kick();
  }, [ready]);

  useEffect(() => {
    const host = root.current;
    const a = layerA.current;
    const b = layerB.current;
    if (!host || !a || !b) {
      return;
    }
    const s = state.current;

    const place = (el: HTMLDivElement, frame: number) => {
      const col = frame % columns;
      const row = Math.floor(frame / columns);
      const x = columns > 1 ? (col / (columns - 1)) * 100 : 0;
      const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
      el.style.backgroundPosition = `${x}% ${y}%`;
    };

    const draw = () => {
      const p = wrap(s.pos, frames);
      const f0 = Math.floor(p) % frames;
      const f1 = (f0 + 1) % frames;
      // Hold each frame crisp for most of its turn and blend only in the middle, so there is no ghosting.
      const raw = p - Math.floor(p);
      const eased = Math.min(1, Math.max(0, (raw - 0.35) / 0.3));
      const mix = Math.round(eased * eased * (3 - 2 * eased) * 100) / 100;
      if (f0 !== s.drawnFrame) {
        place(a, f0);
        place(b, f1);
        s.drawnFrame = f0;
      }
      const spin = Math.round(p * 200) / 200;
      if (spin !== s.drawnSpin) {
        s.drawnSpin = spin;
        host.style.setProperty("--spin", `${((spin / frames) * 360).toFixed(2)}deg`);
      }
      const stamp = Math.round(p * 50) / 50;
      if (mix !== s.drawnMix) {
        b.style.opacity = String(mix);
        s.drawnMix = mix;
      }
      if (stamp !== s.drawnStamp) {
        s.drawnStamp = stamp;
        const yaw = startYaw + (p / frames) * Math.PI * 2;
        host.style.setProperty("--shadow-w", (0.7 + 0.3 * Math.abs(Math.cos(yaw))).toFixed(3));
        if (ticks.current) {
          ticks.current.style.strokeDashoffset = String(-(p / frames) * 100);
        }
        const nearest = Math.round(p) % frames;
        host.setAttribute("aria-valuenow", String(nearest));
        host.setAttribute("aria-valuetext", `${Math.round((nearest / frames) * 360)} degrees`);
      }
    };

    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - (last || now), 64);
      last = now;
      let busy = false;
      if (s.dragging) {
        busy = true;
      } else if (s.target !== null) {
        const diff = s.target - s.pos;
        s.pos = Math.abs(diff) < 0.01 ? s.target : s.pos + diff * Math.min(1, dt * 0.014);
        if (s.pos === s.target) {
          s.target = null;
          s.lastInput = now;
        }
        busy = true;
      } else if (Math.abs(s.velocity) > 0.0004) {
        s.pos += s.velocity * dt;
        s.velocity *= Math.pow(0.94, dt / 16);
        s.lastInput = now;
        busy = true;
      } else if (autoRotate && !reduced && now - s.lastInput > IDLE_BEFORE_AUTO_MS) {
        s.pos += (AUTO_FRAMES_PER_SECOND * dt) / 1000;
        busy = true;
      } else if (autoRotate && !reduced) {
        busy = true;
      }
      draw();
      if (busy && s.visible) {
        s.raf = requestAnimationFrame(tick);
      } else {
        s.running = false;
        last = 0;
      }
    };

    const kick = () => {
      if (!s.running && s.visible) {
        s.running = true;
        s.raf = requestAnimationFrame(tick);
      }
    };
    api.current.kick = kick;

    draw();
    kick();

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        s.visible = entries.some((entry) => entry.isIntersecting);
        if (s.visible) {
          kick();
        }
      });
      observer.observe(host);
    }
    const onVisibility = () => {
      s.visible = document.visibilityState !== "hidden";
      if (s.visible) {
        kick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(s.raf);
      s.running = false;
    };
  }, [frames, columns, rows, startYaw, autoRotate, reduced]);

  const framesPerPixel = () => {
    const width = root.current?.getBoundingClientRect().width || 320;
    return (frames * 0.95) / Math.max(width, 200);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const s = state.current;
    s.dragging = true;
    s.target = null;
    s.velocity = 0;
    s.lastX = event.clientX;
    s.lastT = performance.now();
    s.lastInput = s.lastT;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTouched(true);
    api.current.kick();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.dragging) {
      return;
    }
    const now = performance.now();
    const dx = event.clientX - s.lastX;
    const moved = dx * framesPerPixel();
    s.pos += moved;
    const dt = Math.max(now - s.lastT, 1);
    // Smoothed speed, so a flick keeps going but a pause before release does not.
    s.velocity = s.velocity * 0.6 + (moved / dt) * 0.4;
    s.lastX = event.clientX;
    s.lastT = now;
    s.lastInput = now;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s.dragging) {
      return;
    }
    s.dragging = false;
    s.lastInput = performance.now();
    if (reduced || performance.now() - s.lastT > 90) {
      s.velocity = 0;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    api.current.kick();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const s = state.current;
    let step = 0;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      step = 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      step = -1;
    } else if (event.key === "PageUp") {
      step = 5;
    } else if (event.key === "PageDown") {
      step = -5;
    } else {
      return;
    }
    event.preventDefault();
    s.velocity = 0;
    s.target = Math.round(s.target ?? s.pos) + step;
    s.lastInput = performance.now();
    setTouched(true);
    api.current.kick();
  };

  const sheetStyle: CSSProperties = {
    backgroundImage: `url("${ready ? src : poster ?? src}")`,
    backgroundSize: ready ? `${columns * 100}% ${rows * 100}%` : "100% 100%",
  };
  if (!ready) {
    sheetStyle.backgroundPosition = "0% 0%";
  }

  return (
    <div
      ref={root}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-roledescription="360 degree viewer"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={frames - 1}
      aria-valuenow={0}
      aria-valuetext="0 degrees"
      aria-describedby={`${gradientId}-help`}
      data-ready={ready ? "true" : "false"}
      className={`turntable ${className}`}
      style={{ "--ar": `${frameWidth} / ${frameHeight}`, "--max": `${maxWidth}px` } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDragStart={(event) => event.preventDefault()}
    >
      <span id={`${gradientId}-help`} className="sr-only">
        Drag sideways or use the left and right arrow keys to turn it all the way round.
      </span>

      <div className="turntable__sprite" aria-hidden="true">
      {stage ? (
        <>
          <svg className="turntable__platform" viewBox="0 0 200 60" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id={`${gradientId}-fill`} cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="var(--color-surface)" stopOpacity="1" />
                <stop offset="70%" stopColor="var(--color-surface)" stopOpacity="0.85" />
                <stop offset="100%" stopColor="var(--color-surface)" stopOpacity="0.2" />
              </radialGradient>
            </defs>
            <ellipse cx="100" cy="31" rx="97" ry="25" fill={`url(#${gradientId}-fill)`} className="turntable__disc" />
            <ellipse
              ref={ticks}
              cx="100"
              cy="31"
              rx="91"
              ry="22"
              pathLength={100}
              fill="none"
              className="turntable__ticks"
              strokeDasharray="0.5 2"
            />
          </svg>
          <span className="turntable__floor" aria-hidden="true" />
        </>
      ) : null}

      <div ref={layerA} className="turntable__layer" style={sheetStyle} aria-hidden="true" />
      <div ref={layerB} className="turntable__layer" style={{ ...sheetStyle, opacity: 0 }} aria-hidden="true" />
      </div>

      {children}

      {!touched ? (
        <span className="turntable__hint" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
            <path d="M3 10h14M6 6l-4 4 4 4M14 6l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Drag to rotate
        </span>
      ) : null}
    </div>
  );
}
