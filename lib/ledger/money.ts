/**
 * Integer kobo helpers. Money is never a float anywhere in this codebase (ADR-003).
 * Pure functions, no I/O. Programmer errors throw RangeError. Untrusted text input returns null.
 */
import type { Kobo, LedgerDirection } from "@/contracts/enums";
import { MAX_AMOUNT_KOBO } from "@/contracts/schemas";

/** True for a non negative safe integer. Zero is a valid balance. */
export function isKobo(value: unknown): value is Kobo {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** True for an amount a payment or ledger entry may carry: positive and within the hard ceiling. */
export function isPositiveKobo(value: unknown): value is Kobo {
  return isKobo(value) && value > 0 && value <= MAX_AMOUNT_KOBO;
}

export function assertKobo(value: unknown, label = "amount"): asserts value is Kobo {
  if (!isKobo(value)) {
    throw new RangeError(`${label} must be a non negative safe integer number of kobo`);
  }
}

export function addKobo(a: Kobo, b: Kobo): Kobo {
  assertKobo(a, "first amount");
  assertKobo(b, "second amount");
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError("kobo sum is not a safe integer");
  return sum;
}

/** Subtracts and refuses a negative result. Use balanceOf for signed ledger math. */
export function subKobo(a: Kobo, b: Kobo): Kobo {
  assertKobo(a, "first amount");
  assertKobo(b, "second amount");
  if (b > a) throw new RangeError("kobo difference would be negative");
  return a - b;
}

export function signedKobo(direction: LedgerDirection, amountKobo: Kobo): number {
  assertKobo(amountKobo, "ledger amount");
  return direction === "credit" ? amountKobo : -amountKobo;
}

/** Balance as the sum of entries. May be negative: callers decide what a negative balance means. */
export function balanceOf(entries: ReadonlyArray<{ direction: LedgerDirection; amountKobo: Kobo }>): number {
  let total = 0;
  for (const entry of entries) {
    total += signedKobo(entry.direction, entry.amountKobo);
    if (!Number.isSafeInteger(total)) throw new RangeError("ledger sum is not a safe integer");
  }
  return total;
}

/** Digits with optional comma grouping, then at most two decimals. No sign, no exponent, no spaces inside. */
const NAIRA_PATTERN = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses text like "1500", "1,500.5" or "1500.50" into kobo using integer math only.
 * Returns null for anything else, including three decimals, negatives, exponents and empty text.
 */
export function nairaToKobo(input: string): Kobo | null {
  const match = NAIRA_PATTERN.exec(input.trim());
  if (!match) return null;
  const whole = (match[1] ?? "").replace(/,/g, "");
  if (whole.length > 12) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const kobo = Number(whole) * 100 + Number(fraction);
  return isKobo(kobo) ? kobo : null;
}

/** "1,500.50" style text for an amount in kobo. Integer math only. The currency symbol is the caller's job. */
export function formatNairaPlain(kobo: Kobo): string {
  assertKobo(kobo);
  const whole = Math.floor(kobo / 100);
  const fraction = kobo % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${String(fraction).padStart(2, "0")}`;
}
