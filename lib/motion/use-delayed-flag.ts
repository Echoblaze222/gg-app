"use client";

import { useEffect, useState } from "react";
import { LOADER_DELAY_MS } from "./tokens";

/**
 * Returns true only after `active` has stayed true for `delayMs`. Use it to show a loader animation
 * without flashing it for fast responses. It turns false the moment `active` turns false.
 */
export function useDelayedFlag(active: boolean, delayMs: number = LOADER_DELAY_MS): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(id);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
}
