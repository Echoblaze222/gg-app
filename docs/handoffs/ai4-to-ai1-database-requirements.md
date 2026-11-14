# AI-4 to AI-1: database requirements for the payment tables

You create the first version of these tables in 1000-1999. These are the constraints my service layer relies on. Please confirm each, or tell me what differs. Later changes to payment tables come from my 4000-4999 range.

## Constraints
| # | Requirement | Used by |
|---|-------------|---------|
| 1 | `payment_attempts.reference` unique | A4, webhook lookup |
| 2 | `payment_attempts (member_id, idempotency_key)` unique | I5, duplicate tap |
| 3 | A check on status transitions matching `PAYMENT_ATTEMPT_TRANSITIONS`, and the same for obligations, refunds, payouts | state machine in code and database |
| 4 | `payment_attempts.provider_transaction_id` stored as text, not integer (provider ids are unsigned 64 bit) | verify |
| 5 | `payment_events.provider_event_id` unique | I4 |
| 6 | Ledger: unique on `(payment_attempt_id)` where `entry_type = 'contribution_credit'` | I3, A1 |
| 7 | Ledger: `receipt_number` unique and not null for contribution credits, immutable | receipts |
| 8 | Ledger: no update, no delete, trigger raises (I1). `amount_kobo > 0` check | A7 |
| 9 | `LedgerRepository.post` locks the member balance row, rejects a debit that would go negative with `LEDGER_NEGATIVE_BALANCE` | A8, I2 |
| 10 | Refund and payout debits reference `refund_id` and `payout_id` respectively | traceability |
| 11 | `payment_methods`: unique on `(member_id, provider_card_signature)`, authorization code column encrypted at rest | saved cards |
| 12 | `contribution_obligations` unique on `(plan_id, due_on)` | idempotent generation |

## Questions
1. Receipt number collisions: I generate `GG-YYMMDD-XXXXXXXX` (8 random base32 characters). On a unique violation, should `post` throw a typed error I can catch and retry with a new number, or will you generate the number inside `post`? I prefer the typed error.
2. Forged webhooks: do you want `recordIfNew` to store events with `signatureValid: false` for forensics, or should I store only verified events and use security events for forged ones? I plan the second, to avoid an attacker filling the table.
3. Settings seeds: the keys I read are in section 12 of `docs/payments/00-spec.md`. Please seed the keys with no value for the money limits so the admin must set them, and with the stated default for `refund.enabled` (off).
4. `ObligationRepository.listDue` semantics, see CR-6 in `ai4-contract-request-additions.md`.
