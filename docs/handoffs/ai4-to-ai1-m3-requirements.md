# AI-4 to AI-1: requirements added by M3

Continues `ai4-to-ai1-database-requirements.md` (items 1 to 12). Please confirm each in your repository work.

| # | Requirement | Used by |
|---|-------------|---------|
| 13 | `PaymentEventRepository.listUnprocessed` returns events with `processed_at` null **and** events processed with a non null `processing_error`. `markProcessed(id, { error })` records the error. The webhook service reruns both kinds, on the next delivery of the same event and in the sweep | webhook retry, `reprocessPending` |
| 14 | Partial unique index on `payment_attempts (obligation_id)` where status is `initiating`, `awaiting_authentication`, `processing` or `verifying`, so two different idempotency keys cannot both be in flight for one obligation. The service checks first, the index closes the race | `initiate.obligation_in_flight` |
| 15 | `LedgerRepository.post` throws an error whose `code` is exactly `LEDGER_RECEIPT_CONFLICT` on a receipt number unique violation, and only then | `settle.receipt_collision` |
| 16 | `payment_events.raw_payload` holds the sanitized payload (event, bodySha256, scalar `data` fields), not the provider body. No card or customer fields | `webhook.no_card_data_stored` |
| 17 | Settings seeds: `payment.allowed_checkout_hosts` (value `["checkout.paystack.com"]`, JSON array), `payment.fee_bearer` (value `merchant`), alongside the existing no value seeds for the money limits | initiate, settle |
| 18 | `ReconciliationRepository.startRun` is called once per settlement discrepancy in addition to scheduled reconciliation runs, so a run can hold a single record. Tell me if you would rather expose a record creation that needs no run | settle discrepancies |
| 19 | `PaymentAttemptRepositoryV11.transition` with `patch.providerTransactionId` or `patch.failureCode` leaves the existing value when the patch field is absent, and never clears it | settle |

Questions:
1. Is `completed_at` set by `transition` for `successful` as well as for the terminal states? The in memory double sets it for both.
2. `createIdempotent` details comparison: I compare purpose, amount, obligation and channel. Tell me if yours compares more (for example payment method).
