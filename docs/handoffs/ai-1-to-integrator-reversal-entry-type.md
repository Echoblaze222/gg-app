# Handoff: AI-1 to Integrator, reversal entry type (additive contract change)

**Change:** `contracts/enums.ts` `LEDGER_ENTRY_TYPES` gains `"payment_reversal_debit"` (database enum value added in migration 1970).

**Why:** ADR-015. A payment the provider reverses must leave the ledger, so a member cannot withdraw clawed-back money.

**Compatibility:** additive. Code that switches over ledger entry types needs a case for it (a debit; label e.g. "Payment reversed").

**Also new (database only):** table `payment_shortfalls` (server only), functions `ledger_reverse_payment(attempt)` and `payment_shortfall_resolve(id, by, resolution, note)`, and a payout guard that raises `PAYOUT_NOT_ELIGIBLE` while a shortfall is open and `PAYOUT_INSUFFICIENT_BALANCE` if the ledger no longer covers a payout being approved or sent.

**For other AIs:**
- AI-4: on a `reversed` verify, just update the attempt status; the database posts the debit. Open the reconciliation record and publish the event when `ledger_reverse_payment` reports a shortfall.
- AI-3: clamp `member_available` at zero in the UI; a reversal can push it below zero. The resolve screen must call `requirePermission("admin.ledger.adjust")`, reauthenticate, and write an audit log.

**Needs your approval:** the contract version bump.
