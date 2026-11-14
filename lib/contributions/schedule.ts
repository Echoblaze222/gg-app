/**
 * Contribution schedule math. Pure functions, no I/O.
 *
 * The business calendar is Africa/Lagos, which is UTC+1 all year with no daylight saving.
 * Dates are YYYY-MM-DD strings. Calendar arithmetic uses integer day numbers (proleptic Gregorian),
 * so no Date object is involved and no time zone can shift a due date.
 */
import type { ContributionFrequency, ObligationStatus } from "@/contracts/enums";
import type { IsoDate } from "@/contracts/entities";

export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1 to 12
  readonly day: number; // 1 to 31
}

const MIN_YEAR = 1970;
const MAX_YEAR = 9999;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Returns null unless the text is a real calendar date between 1970 and 9999. */
export function parseIsoDate(text: string): CivilDate | null {
  const match = ISO_DATE.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatIsoDate(date: CivilDate): IsoDate {
  const y = String(date.year).padStart(4, "0");
  const m = String(date.month).padStart(2, "0");
  const d = String(date.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Day number where 1970-01-01 is 0. Howard Hinnant's days_from_civil. */
export function daysFromCivil(date: CivilDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (date.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

function mustParse(text: string, label: string): CivilDate {
  const parsed = parseIsoDate(text);
  if (!parsed) throw new RangeError(`${label} is not a valid date: ${text}`);
  return parsed;
}

function assertWholeNumber(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non negative integer`);
  }
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) throw new RangeError("days must be an integer");
  return formatIsoDate(civilFromDays(daysFromCivil(mustParse(date, "date")) + days));
}

/**
 * Adds whole months and clamps the day to the end of the target month.
 * The day of month is taken from the argument, so callers anchor on the original start date.
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  assertWholeNumber(months, "months");
  const start = mustParse(date, "date");
  const index = start.year * 12 + (start.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  if (year > MAX_YEAR) throw new RangeError("date is beyond the supported range");
  return formatIsoDate({ year, month, day: Math.min(start.day, daysInMonth(year, month)) });
}

/** Lexicographic order is chronological for valid YYYY-MM-DD strings. */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from a to b. Positive when b is later. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return daysFromCivil(mustParse(b, "date")) - daysFromCivil(mustParse(a, "date"));
}

/** The calendar date in Africa/Lagos at an instant. */
export function lagosDate(now: Date): IsoDate {
  const ms = now.getTime();
  if (!Number.isFinite(ms)) throw new RangeError("now is not a valid instant");
  return new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The n th due date (n starts at 0, which is startsOn itself).
 * Daily adds n days, weekly adds 7n days, monthly adds n months anchored on the day of startsOn
 * and clamped to the month end, so Jan 31 gives Feb 28 then Mar 31 and the anchor never drifts.
 */
export function dueDate(startsOn: IsoDate, frequency: ContributionFrequency, n: number): IsoDate {
  assertWholeNumber(n, "occurrence index");
  switch (frequency) {
    case "daily":
      return addDays(startsOn, n);
    case "weekly":
      return addDays(startsOn, 7 * n);
    case "monthly":
      return addMonthsClamped(startsOn, n);
  }
}

export interface Occurrence {
  readonly index: number;
  readonly dueOn: IsoDate;
}

/** Hard cap so a bad horizon can never loop for ever. Callers page by horizon, not by count. */
export const MAX_OCCURRENCES_PER_CALL = 1000;

/**
 * Every due date from startsOn through `through` inclusive, oldest first.
 * Throws RangeError when the span would exceed MAX_OCCURRENCES_PER_CALL.
 */
export function occurrencesThrough(startsOn: IsoDate, frequency: ContributionFrequency, through: IsoDate): Occurrence[] {
  mustParse(startsOn, "startsOn");
  mustParse(through, "through");
  const out: Occurrence[] = [];
  for (let index = 0; ; index += 1) {
    const dueOn = dueDate(startsOn, frequency, index);
    if (compareIsoDate(dueOn, through) > 0) break;
    if (out.length >= MAX_OCCURRENCES_PER_CALL) throw new RangeError("too many occurrences requested");
    out.push({ index, dueOn });
  }
  return out;
}

/**
 * The status time alone implies for an obligation that nobody has paid or cancelled:
 * scheduled before the due date, due from the due date through the grace period, missed after it.
 * Paid and cancelled come from events, never from the clock.
 */
export function timeBasedStatus(input: { today: IsoDate; dueOn: IsoDate; graceDays: number }): Extract<ObligationStatus, "scheduled" | "due" | "missed"> {
  assertWholeNumber(input.graceDays, "graceDays");
  if (compareIsoDate(input.today, input.dueOn) < 0) return "scheduled";
  const lastDueDay = addDays(input.dueOn, input.graceDays);
  return compareIsoDate(input.today, lastDueDay) <= 0 ? "due" : "missed";
}
