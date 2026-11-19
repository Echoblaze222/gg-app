# Handoff: AI-1 to AI-4, spec fix for reversals (docs/payments/00-spec.md)

`docs/payments/00-spec.md` belongs to AI-4, so AI-1 does not edit it. Section 11 "Reversals (chargebacks)" still describes the old rule (try an `adjustment_debit`). The built behavior is ADR-015 and migrations 1970 and 1971 (PR #54). Please replace the section with the text below, and adjust the two cross references.

## Replacement for section 11, "Reversals (chargebacks)"

- Verify status `reversed` on a credited attempt: the service only moves the attempt to `reversed`. It does not post a debit itself. The database trigger runs `ledger_reverse_payment(attempt)`, which posts one `payment_reversal_debit` for the attempt (unique per attempt, so a repeat is a no-op).
- The debit takes what the member still has, up to the payment amount, under the same ledger row lock as every other money change. Money in a `processing` payout is not taken back.
- Whatever cannot be taken back is recorded in `payment_shortfalls` (server only, never deleted, resolved once). The balance never goes negative from this path.
- An open shortfall blocks payout create, approve and process with `PAYOUT_NOT_ELIGIBLE`. A payout already `processing` can still be marked paid. A payout the ledger no longer covers fails with `PAYOUT_INSUFFICIENT_BALANCE`.
- When `ledger_reverse_payment` reports a shortfall, AI-4 opens the reconciliation record and publishes `reconciliation.discrepancy_found`. Resolving a shortfall is `payment_shortfall_resolve`, which needs `admin.ledger.adjust` and a written note.
- Q5 (policy when a chargeback arrives after withdrawal) is answered by ADR-015: record a shortfall and block payouts. Not built yet: the pending-reversal hold and the card cooling period.

## Other spec lines to align

- Invariant A8 and section 7 ("A reversal or refund is a new debit entry"): name the entry type `payment_reversal_debit` for reversals.
- Section 5.2 step 5, `reversed` bullet: "see section 11" stays valid, but say the attempt moves to `reversed` and the database posts the debit.
- Section 16, Q5: mark as decided by ADR-015.

## Contract note

`payment_reversal_debit` is an additive value in `contracts/enums.ts` `LEDGER_ENTRY_TYPES`. Switches over ledger entry types need a case for it (a debit, label e.g. "Payment reversed"). The version bump is waiting on the Integrator, see `ai-1-to-integrator-reversal-entry-type.md`.
