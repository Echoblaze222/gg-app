/**
 * Business calendar helpers. The business calendar is Africa/Lagos, which is UTC+1 all year with no daylight
 * saving. Fixed offset arithmetic keeps these functions deterministic and testable without Intl or time zone data.
 */

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function lagosShifted(timestamp: string | Date): string {
  const instant = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  // toISOString throws RangeError for an invalid date, which is the right outcome for corrupt input.
  return new Date(instant.getTime() + LAGOS_OFFSET_MS).toISOString();
}

/** The Lagos calendar date (YYYY-MM-DD) of an instant. */
export function lagosDateOf(timestamp: string | Date): string {
  return lagosShifted(timestamp).slice(0, 10);
}

/** The Lagos wall clock time (HH:MM) of an instant. */
export function lagosTimeOf(timestamp: string | Date): string {
  return lagosShifted(timestamp).slice(11, 16);
}

export function lagosToday(now: Date): string {
  return lagosDateOf(now);
}

/** True only for real calendar dates between 2000 and 2100 in the form YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. Throws RangeError for an invalid date. */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new RangeError("Both values must be valid dates in the form YYYY-MM-DD.");
  }
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
