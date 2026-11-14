/**
 * Poll schedule for confirming a payment. About 53 seconds in total, then we stop and tell the member honestly
 * that confirmation is still pending. Capped, backed off and jittered so many members cannot stampede the server.
 */
export const POLL_BASE_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 13000, 21000] as const;
export const MAX_POLLS = POLL_BASE_DELAYS_MS.length;

/**
 * Delay before poll number `pollIndex` (0 based), or null when polling is exhausted.
 * `random` must return a number in [0, 1). Out of range values are clamped.
 */
export function pollDelayMs(pollIndex: number, random: () => number): number | null {
  if (!Number.isInteger(pollIndex) || pollIndex < 0) {
    throw new RangeError("pollIndex must be a non-negative integer.");
  }
  if (pollIndex >= MAX_POLLS) {
    return null;
  }
  const raw = random();
  const r = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0.5;
  const base = POLL_BASE_DELAYS_MS[pollIndex] as number;
  return Math.round(base * (0.8 + 0.4 * r));
}
