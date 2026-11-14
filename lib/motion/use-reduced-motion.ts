"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return canMatch() ? window.matchMedia(QUERY).matches : false;
}

/** The server cannot know, so it renders the motion version. The CSS safety net covers the gap before hydration. */
function getServerSnapshot(): boolean {
  return false;
}

/** True when the person asked the system for less motion. Updates live if they change the setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
