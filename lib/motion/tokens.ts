/**
 * Motion values for code that needs numbers (timers, Web Animations). CSS reads the same values from styles/tokens.css.
 * lib/motion/tokens.test.ts fails if the two drift apart.
 */
export const MOTION_MS = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 400,
  deliberate: 1800,
} as const;

export const EASING = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter: "cubic-bezier(0.05, 0.7, 0.1, 1)",
  exit: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1)",
} as const;

/** Loaders appear only after this delay so fast responses never flash an animation (RESEARCH.md 4.6 rule 5). */
export const LOADER_DELAY_MS = 300;
