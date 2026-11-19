import type { Balance } from "../../contracts/entities";
import { formatNaira } from "./money";

export type BalanceView =
  | { readonly kind: "ok"; readonly available: string; readonly ledger: string; readonly held: string; readonly hasHold: boolean }
  /** The numbers broke a ledger rule. No amount is shown, because a wrong balance is worse than none. */
  | { readonly kind: "unverified" };

/**
 * Checks the invariants from ADR-003 before anything is formatted: no negative money, and
 * available + held = ledger. A violation means the data cannot be trusted, so nothing is displayed.
 */
export function balanceView(balance: Balance): BalanceView {
  const { ledgerKobo, availableKobo, heldKobo } = balance;
  const allSafe = [ledgerKobo, availableKobo, heldKobo].every((value) => Number.isSafeInteger(value) && value >= 0);
  if (!allSafe || availableKobo + heldKobo !== ledgerKobo) {
    return { kind: "unverified" };
  }
  return {
    kind: "ok",
    available: formatNaira(availableKobo),
    ledger: formatNaira(ledgerKobo),
    held: formatNaira(heldKobo),
    hasHold: heldKobo > 0,
  };
}
