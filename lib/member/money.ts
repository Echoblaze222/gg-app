const NAIRA = "\u20A6";

/**
 * Formats integer kobo as naira with exactly two decimals, using integer math only.
 * Throws RangeError for anything that is not a non-negative safe integer, so a corrupt value
 * can never be shown to a member as a plausible looking amount.
 */
export function formatNaira(kobo: number): string {
  if (!Number.isSafeInteger(kobo) || kobo < 0) {
    throw new RangeError("Amount must be a non-negative integer number of kobo.");
  }
  const fraction = kobo % 100;
  const whole = (kobo - fraction) / 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${NAIRA}${grouped}.${String(fraction).padStart(2, "0")}`;
}

/** Ledger amounts are always positive. The direction decides the sign. */
export function formatLedgerAmount(amountKobo: number, direction: "credit" | "debit"): string {
  return `${direction === "credit" ? "+" : "-"}${formatNaira(amountKobo)}`;
}
