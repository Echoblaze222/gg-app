# ai5 contract request: receipt number is not reachable from a payment attempt

From: AI-5. To: Integrator and AI-4. Base: `integration` @ 59b43bc49fcf, contracts v1.0.0. Additive only.

## Problem (VERIFIED in the contracts)
- The receipt route is `/app/history/[receiptNumber]` (`contracts/routes.md`).
- The history list comes from `PaymentService.listHistory`, which returns `PaymentAttempt`. A `PaymentAttempt` has no `receiptNumber`.
- The receipt number lives only on `LedgerEntry` (type `contribution_credit`), reached through `ContributionService.listLedger`.
- Joining the two lists on the screen is unreliable. They are separate cursor pages, so a successful attempt on page 1 of history can have its ledger credit on page 3 of the ledger. That row would show as paid with no receipt link.

## Current workaround (no contract change)
`lib/member/history.ts` builds a best effort index from the ledger pages already loaded. A successful payment without a known receipt is shown without a link, never with a wrong one. This is correct but incomplete.

## Request (pick one, AI-4 decides)
1. Add `receiptNumber: string | null` to the history item returned by `PaymentService.listHistory` (a new `PaymentHistoryItem` that extends `PaymentAttempt`), or
2. Add `ReceiptService.getReceiptByAttempt(ctx, { attemptId })`.

Option 1 is simpler for the screen and avoids one request per row.

## Impact
Without it, member history can show successful payments with no receipt link until the member opens ledger pages that contain the credit. Not a money risk, a completeness risk.
