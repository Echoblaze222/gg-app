# Payments and Contribution Engine: Spec (AI-4)

Status: M0 (this spec), M1 (pure domain code in `lib/ledger`, `lib/contributions`, `lib/payments`) and M2 (provider boundary, Paystack adapter, fake provider in `lib/payments/provider`, `tests/payments`) are done. M3 (payment service, section 17) is in progress. M4 onward not started.
Owner of this document: AI-4. Contract version this was written against: 1.0.0, with the additive v1.1.0 file `contracts/v1_1.ts` applied by the Integrator.

## 1. Sources and what they settled

Provider facts below come from Paystack's official docs, read on 2026-11-14. Third party summaries were used only to find the official page.

| Topic | Source | What it settled |
|-------|--------|-----------------|
| Webhooks | https://paystack.com/docs/payments/webhooks/ and https://docs-v2.paystack.com/payments/webhooks/ | Header `x-paystack-signature` is HMAC SHA512 of the payload keyed with the secret key. Three source IPs are published for optional allowlisting. Live mode retries every 3 minutes for 4 tries, then hourly for 72 hours. Test mode retries hourly for 72 hours. Payload has `event` and `data`. No top level event id was found. |
| Verify | https://paystack.com/docs/payments/verify-payments/ and https://paystack.com/docs/api/transaction/ | `GET /transaction/verify/:reference`. Transaction status is `data.status`, not the top level `status`. Values: `abandoned`, `failed`, `ongoing`, `reversed`, `success`. Transaction id must be treated as an unsigned 64 bit integer, so we store it as text. Webhooks are sent for successful transactions only, so failures must be found by verify. The sample shows `amount` 40333 with `requested_amount` 30050 and `fees` 10283: when fees are passed to the customer, the paid total is the requested amount plus fees. |
| Initialize | https://paystack.com/docs/api/transaction/ | `POST /transaction/initialize` returns `authorization_url`, `access_code`, `reference`. Reference allows only letters, digits, `-`, `.` and `=`. Amount is in the smallest unit, typed as a string in the docs. |
| Saved cards | https://paystack.com/docs/payments/recurring-charges | Charge with `authorization_code`, customer `email` and `amount` at `POST /transaction/charge_authorization`. Only `reusable: true` authorizations may be charged. Only the email used to create an authorization can charge it. A challenged charge returns a redirect URL (`authorization_url`, `paused: true`). |
| Bulk charge | https://paystack.com/docs/payments/bulk-charge/ | Only successful charges send webhooks. Failures need verify. Not used in v1 (see section 9). |
| Refunds | https://paystack.com/docs/payments/refunds/ | `POST /refund` with a transaction reference. Optional `amount` for partial refund, never more than the original. We may pass our own refund `reference`. A repeated reference is not a failure, fetch the existing refund. Statuses: `pending`, `processing`, `processed`, `failed`, `needs-attention`. Failed refund credits the merchant balance back. |

Not yet confirmed from official docs (adapter treats these defensively, see section 5.4):
- The redirect form of a challenged `charge_authorization`. No full sample body is published, so the adapter's redirect detection (an `authorization_url` in the answer) is an assumption.
- The exact `gateway_response` strings for insufficient funds and declines.
- Whether `ongoing` can persist for card payments after the customer closes checkout.

The sandbox suite (section 14) is how these get confirmed. It needs a Paystack test key held by the Integrator or owner. AI-4 never holds a key.

## 2. Scope

From `contracts/services.ts`: PaymentService, ContributionService, ReceiptService, ReconciliationService. Plus the webhook handler, the charge runner, and PayoutService (deferred to the last milestone, see section 11).

Owned paths: `lib/payments/`, `lib/contributions/`, `lib/ledger/`, `app/api/payments/`, `app/api/webhooks/`, `supabase/migrations/4000-4999_*`, `docs/payments/`. Path gaps are in `docs/handoffs/ai4-to-integrator-ownership.md`.

## 3. Principles

1. The server is the only authority on money. The client can request, never declare.
2. Every step that touches money is idempotent or compare and set. A crash at any line must be recoverable by running the same code again.
3. Amounts are integer kobo end to end. No float, no string math.
4. Provider data enters the system through the verify endpoint, never from a webhook body or a client value.
5. Fail closed. A missing money limit blocks payment creation with a clear error. It does not fall back to a guess.
6. Services return `Result`. Expected failures are error codes from `contracts/errors.ts`. No new codes are invented here.
7. Test doubles live only under `tests/payments/`. Production paths contain no fake success.
8. Nothing secret is logged or returned: secret key, authorization code, card signature, raw provider bodies in errors.

## 4. Invariants

The database invariants I1 to I10 in `docs/architecture/01-vision-and-protocol.md` apply. AI-4 adds service level invariants. Each has a test.

| # | Invariant |
|---|-----------|
| A1 | A payment attempt is `successful` if and only if exactly one `contribution_credit` ledger entry references it. Reconciliation checks this. |
| A2 | Credit happens only after verify returns status `success`, the same reference, currency NGN, and an amount equal to the attempt amount, or, only when the admin setting `payment.fee_bearer` is `customer`, equal to the requested amount plus the provider's fees. Any mismatch posts nothing and opens a discrepancy. The ledger credits the attempt amount, never the provider total. |
| A3 | A webhook body is a hint. It selects which reference to verify. It never supplies an amount or a status that we act on. |
| A4 | One idempotency key maps to one reference for ever. We never create a second provider transaction for the same key. |
| A5 | Domain events are published only by the caller that won the compare and set transition. A losing caller publishes nothing. |
| A6 | Only `reusable` authorizations are ever charged without the member present. |
| A7 | Ledger rows are never updated or deleted. Corrections are new rows with a reason. |
| A8 | A debit never makes a balance negative. The repository enforces it, the service handles the error. |

## 5. Making a payment

### 5.1 Initiate (`PaymentService.initiate`)

Data flow:
1. Route handler parses the body with `initiatePaymentInputSchema` and a byte cap (`parseBody` from `lib/security`).
2. `requirePermission(ctx, "member.payment.create")`, then `RateLimiter.check` with rule `payment_initiate`.
3. Load limits from `SettingsRepository`. Missing limit: fail closed. Out of range: `CONTRIBUTION_OUT_OF_RANGE` or `PAYMENT_AMOUNT_INVALID`.
4. For `scheduled_contribution` and `one_time_contribution` with an `obligationId`: the obligation must belong to the member, be `due` or `scheduled`, and the amount must equal the obligation amount. Otherwise `VALIDATION_FAILED`.
5. `paymentAttempts.createIdempotent` with a generated reference. Same key and same details returns the existing attempt. Same key and different details is `IDEMPOTENCY_KEY_REUSED`.
6. If the attempt already existed and is not `initiating`, return it as is. If it is `initiating`, return `PAYMENT_DUPLICATE_IN_PROGRESS` until contract request CR-1 gives us the stored access code.
7. Call the provider (section 5.4). Redirect case: transition `initiating` to `awaiting_authentication`, return the URL. Saved method case: see section 8.
8. Publish `payment.status_changed` after the transition commits.

States the UI sees: idle (client only), initiating, awaiting_authentication, processing, verifying, then a terminal state. Failure copy comes from `ERROR_DEFINITIONS` and always says whether money moved.

Reference format: `gg-` plus 20 random characters from a Crockford base32 alphabet, from `crypto.randomBytes`. Letters and digits only, so it is valid for the provider and unguessable.

Provider timeout during initialize: the attempt stays `initiating`. We do not retry initialize with a new reference. Reconciliation verifies the reference later. A timeout during initialize returns `PAYMENT_PROVIDER_TIMEOUT` (money moved: unknown).

Attempt expiry: an attempt in `initiating`, `awaiting_authentication` or `processing` older than `payment.attempt_expiry_minutes` is verified once, then moved to `expired` if the provider says `abandoned`. `pathToExpired` encodes the steps. `verifying` cannot expire directly and steps back to `processing` first.

### 5.2 Settlement (`verifyAndSettle`)

One function, three callers: the browser return route, the webhook handler, the reconciliation job. All three run the same code, so they cannot disagree.

Steps, in this order. Each step is safe to repeat:
1. Load the attempt by reference. Unknown reference: `NOT_FOUND`. The caller must own the attempt, except system callers.
2. If the attempt is terminal, return it. Nothing else happens.
3. Move the attempt to `verifying` with `pathToVerifying` (lib/payments/transitions.ts). The contract allows `verifying` only from `processing`, so `initiating` and `awaiting_authentication` pass through `processing` first, one compare and set per step. A null result on any step means someone else is settling. Re-read and return.
4. Call the provider verify with a timeout.
5. Map the provider status:
   - `success`: check A2. On match go to step 6. On mismatch open a reconciliation record with `PROVIDER_VERIFY_MISMATCH`, move the attempt to `failed`, post nothing.
   - `failed`: move to `failed` with a failure code. Publish `payment.failed`.
   - `abandoned`: step back from `verifying` to `processing` (allowed by the contract) and leave it there until expiry.
   - `ongoing`: transition `verifying` back to `processing` (allowed by the contract) and stop.
   - `reversed`: see section 11.
   - any other value: treat as `ongoing`. Never as success.
6. Post the ledger credit. It is idempotent on the attempt id, so a repeat returns the existing entry. A receipt number collision is retried with a new number, at most 3 times (Integrator decision).
7. Transition the obligation to `paid` with the attempt id, by compare and set. The contract has no direct `scheduled` to `paid` edge, so a still scheduled obligation goes `scheduled`, `due`, `paid` (`pathToPaid`).
8. If the purpose is `card_authorization` and the authorization is reusable, save the method (section 8). Idempotent on member and card signature.
9. Compare and set `verifying` to `successful`. Only the winner continues.
10. The winner publishes `payment.status_changed` and `payment.succeeded`, then notifies the member. `ledger.entry_posted` is published by the caller that created the entry (`created: true`), and `payment_method.saved` by the caller that created the method.

Why the terminal status comes last (changed in M3, the earlier order was ledger, status, then the rest): every step before the status flip is idempotent or compare and set, and the attempt stays non terminal until all of them are done. A crash anywhere before step 9 leaves a `verifying` attempt that the next callback, webhook or reconciliation run settles again, repeating each step harmlessly and finishing the missing ones. With the old order a crash between the status flip and the obligation update left a `successful` attempt that nothing would ever revisit, because step 2 returns terminal attempts untouched. The only window left after step 9 is a lost event or notification, never lost state. The ledger still comes before the status, so `successful` never exists without a credit (A1).

### 5.3 Return route and polling

The browser return calls `POST /api/payments/verify` with the reference. It runs `verifyAndSettle` and returns the attempt. If the provider says `ongoing`, the response is the attempt in `processing`, and the UI shows the calm pending state and polls `getAttempt`. The UI never marks success by itself.

### 5.4 Provider adapter

`lib/payments/provider/types.ts` defines a `PaymentProvider` interface. `lib/payments/provider/paystack.ts` implements it with `fetch`.

- Explicit timeout on every call (default 10 s, from config).
- No automatic retry on initialize or charge. A retry could double charge. Verify and fetch calls may retry on network errors with backoff and jitter, capped.
- Responses are parsed with Zod. Unknown shapes become a typed `unknown` result that settlement treats as `ongoing`, never as success.
- `charge_authorization` returns a closed union: `redirect` (URL) or `submitted` (with an informational status hint). Neither proves money moved, so settlement always verifies by reference next.
- Every failure carries `definitelyNotProcessed`. It is true only for refusals (4xx other than 429). Timeouts, network errors, 5xx, 429 and unreadable answers are unknown outcomes and must be settled by verify, never retried with a new reference.
- Transaction ids are unsigned 64 bit, so long `id` values are quoted before JSON parsing and kept as text.
- The adapter reads no environment. `lib/payments/provider/index.ts`, the only file importing `server-only`, builds it from env and fails every call as `unauthorized` when the key is missing.
- Base URL from `PAYSTACK_BASE_URL`, key from `PAYSTACK_SECRET_KEY`, both server only (`import "server-only"`).
- Errors are mapped to `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_PROVIDER_TIMEOUT` or `PAYMENT_DECLINED`. Provider messages are never shown raw.
- The fake provider for tests lives in `tests/payments/fake-provider.ts` and can script every status and failure.

## 6. Webhook handler (`app/api/webhooks/paystack/route.ts`)

1. Read the raw body as text. No JSON parse before verification.
2. Enforce a byte cap.
3. Verify with `createHmacWebhookVerifier({ algorithm: "sha512", encoding: "hex" })` from `lib/security`, header `x-paystack-signature`, secret `PAYSTACK_SECRET_KEY`.
4. Invalid signature: record a `webhook_signature_invalid` security event, return 401, store nothing that could be trusted. (`recordIfNew` is called with `signatureValid: false` only if AI-1 wants forged attempts kept for forensics, see the AI-1 handoff.)
5. Valid: derive `providerEventId`. Paystack documents no event id, so it is `event:data.id:data.status` when present, else the SHA 256 of the raw body. This is a dedupe aid only. Correctness rests on A1 and the ledger uniqueness, not on this key.
6. `paymentEvents.recordIfNew` stores the raw event first. A duplicate returns 200 `WEBHOOK_DUPLICATE` and stops.
7. Process: for `charge.success` and charge related events, read `data.reference`, then run `verifyAndSettle` (the body amount is ignored, A3). For `refund.*` events, update the matching refund (section 11). Unknown events are stored and marked processed with no action.
8. Mark the event processed. If processing throws, record the error on the event and still return 200, because the event is durable and the sweeper retries it. Returning 500 would only make the provider retry something we can already recover.
9. The reconciliation job calls `listUnprocessed` and reprocesses. Out of order events are safe because settlement reads provider truth, not event order.

Provider IP allowlisting is an optional extra layer behind a config flag. It is never the only check, and proxies can hide the source IP, so it stays off by default.

## 7. Money and ledger

- `lib/ledger/` holds business rules: receipt number generation, entry construction, balance checks that give friendly errors. All writes go through `LedgerRepository.post`.
- Receipt number: `GG-` plus Lagos date `YYMMDD` plus 8 random Crockford base32 characters. Immutable, unique. Generated by us, stored on the entry. On a unique violation the Integrator decided: retry with a new number, at most 3 times.
- A reversal or refund is a new debit entry referencing the attempt or refund. Nothing is edited.

## 8. Saved cards

- A card is saved only from a successful verify with purpose `card_authorization` and `authorization.reusable === true`. Other purposes never save a card, because the input contract has no consent flag. This is the safest reading and is listed as Q2.
- Stored fields: authorization code, card signature, brand, last4, expiry, bank, reusable, email used. Nothing else. Saved through `saveIfNew` (idempotent on member and signature).
- Never sent to a client. Screens get `PaymentMethodView` only.
- Charging a saved method: server loads the method, requires it belongs to the member, not revoked, and `reusable`. Otherwise `PAYMENT_NOT_REUSABLE`. The email sent is the stored `authorizationEmail`.
- A redirect response means the bank challenged the charge. The attempt becomes `awaiting_authentication` and the member gets the URL (`PAYMENT_AUTH_REQUIRED` copy).
- For scheduled runs with no member present, a challenged charge cannot complete. The attempt is marked failed with the auth required code, the obligation stays open, and the member is notified to pay manually.
- Encryption at rest for the authorization code is an AI-1 and Integrator decision (Supabase column encryption). Listed in the AI-1 handoff.

## 9. Contribution engine and scheduled collection

Rules that the owner has not confirmed stay in configuration (section 12).

### 9.1 Schedule computation (pure functions, `lib/contributions/schedule.ts`)

- Calendar is Africa/Lagos, which is UTC+1 all year with no daylight saving. Dates are `YYYY-MM-DD` strings. No `Date` arithmetic across zones.
- `dueDate(startsOn, frequency, n)`: daily adds n days, weekly adds 7n days, monthly adds n months anchored to the day of `startsOn` and clamped to the month end. Jan 31 gives Feb 28, then Mar 31. The anchor never drifts.
- Status by date: `scheduled` before the due date, `due` on or after it, `missed` after `obligation.grace_days` past due with no payment.

### 9.2 Jobs

- `generate-obligations`: for each active plan, ensure obligations exist up to a horizon. Uses `generateIfAbsent`, unique on plan and date, so reruns are harmless.
- `charge-due` (`/api/jobs/charge-due`, `CRON_SECRET`): for each due obligation whose plan has a reusable saved method, create an attempt with key `chg-<obligationId>-<attemptNo>` and charge. A crash and rerun reuses the same key and so the same reference.
- Batches with a concurrency cap and a per call delay with jitter. Resumable by design: state lives in attempts and obligations, not in the job.
- Retry policy: up to `charge.max_attempts` attempts per obligation, spaced by `charge.retry_backoff_hours`. After the last failure the obligation stays `due`, then becomes `missed` after the grace period, and `obligation.missed` is published. What a miss costs the member is a policy question (Q1) and nothing is applied until configured.
- Notifications go through `NotificationService.notify` with types `contribution_due`, `contribution_reminder`, `payment_failed`, `contribution_missed`.
- Bulk charge is not used. One attempt per obligation keeps the state machine and idempotency simple. Revisit only if load tests demand it.

## 10. Failure matrix

| Case | What happens | Final state | Money moved shown to user | Test |
|------|--------------|-------------|---------------------------|------|
| Success | verify success, credit, receipt | successful | yes | `settle.success` |
| Declined | verify failed | failed | no | `settle.declined` |
| Pending | verify ongoing | processing | unknown, we will update you | `settle.pending` |
| Provider timeout on verify | stays verifying, retried by reconcile | verifying | unknown | `settle.verify_timeout` |
| Provider timeout on initialize | stays initiating, verified later | initiating | unknown | `initiate.timeout` |
| Duplicate tap | same key returns same attempt | unchanged | unchanged | `initiate.duplicate_tap` |
| Same key, different amount | `IDEMPOTENCY_KEY_REUSED` | unchanged | no | `initiate.key_reused` |
| Duplicate webhook | stored once, second is a no-op | unchanged | unchanged | `webhook.duplicate` |
| Concurrent callback and webhook | one wins the compare and set, one credit | successful | yes | `settle.race` |
| Out of order webhook | settlement reads provider truth | correct | correct | `webhook.out_of_order` |
| Forged webhook | 401, security event, nothing stored as trusted | unchanged | no | `webhook.forged` |
| Valid signature, wrong amount in body | body ignored, verify decides | correct | correct | `webhook.body_amount_ignored` |
| Verify amount mismatch | no credit, discrepancy opened | failed | unknown, support will review | `settle.amount_mismatch` |
| Callback interrupted | webhook or reconcile settles | successful | yes | `settle.callback_lost` |
| Auth required | redirect, awaiting_authentication | awaiting_authentication | no | `charge.auth_required` |
| Auth abandoned | expires after TTL | expired | no | `expire.abandoned` |
| Crash after ledger post | rerun finishes steps 7 to 10 | successful | yes | `settle.crash_after_ledger` |
| Provider down | block new payments, read screens work | n/a | no | `initiate.provider_down` |
| Refund | request, approve, provider, debit | see section 11 | yes | `refund.*` |
| Reconciliation | stuck and mismatched records found | resolved or open | per case | `reconcile.*` |

## 11. Refunds, reversals, reconciliation, receipts, payouts

### Refunds
- `requestRefund` needs `admin.payments.refund` and reauthentication. Rule: the sum of refunds for an attempt never exceeds its amount, and the member's available balance must cover it.
- Config gate `refund.enabled`, default off, because the owner has not set a refund policy (Q4).
- On approval, `refund_debit` is posted before calling the provider so the money cannot be spent twice. Provider call uses our refund id as the provider `reference`, so a repeat is a lookup, not a second refund. If the provider reports `failed`, an `adjustment_credit` with a reason and the refund id restores the balance.
- Provider refund events move the refund `processing` to `completed` or `failed`.

### Reversals (chargebacks)
- Verify status `reversed` on a credited attempt: try an `adjustment_debit` with reason and the attempt id. If it would make the balance negative, do not force it. Open a reconciliation record for the owner and publish `reconciliation.discrepancy_found`. Policy for lost money is Q5.

### Reconciliation (`ReconciliationService.run`, `/api/jobs/reconcile`)
1. Reprocess unprocessed webhook events.
2. Resolve attempts stuck in `initiating`, `processing` or `verifying` past a threshold through verify.
3. Check A1 both ways: every `successful` attempt has one credit, every credit has a `successful` attempt.
4. Compare provider transaction list for the window with attempts, and record unknown references and amount differences.
5. Write `ReconciliationRecord` rows and publish discrepancy events. Never fix money silently. Fixes are adjustments an admin approves.

### Receipts
`ReceiptService.getReceipt` reads the credit entry by receipt number, owner only. It needs the balance after the entry, which is stored at posting time (CR-2). Rendering belongs to AI-3 and AI-5.

### Payouts
The contract puts `PayoutService` with AI-4, but no owned path or OTP storage exists for it (see handoffs). Scheduled last. Disbursement in v1 is admin initiated: `markPaid` records the transfer reference the admin entered. No provider transfer API is called, which avoids extra regulatory and cost surface.

## 12. Configuration keys (SettingsRepository)

No defaults for money limits. A missing key blocks the related action.

| Key | Meaning |
|-----|---------|
| `contribution.min_kobo`, `contribution.max_kobo` | Allowed contribution range |
| `payment.attempt_expiry_minutes` | When an unfinished attempt is verified and expired |
| `provider.timeout_ms` | Per call timeout |
| `charge.max_attempts`, `charge.retry_backoff_hours` | Scheduled charge retry policy |
| `obligation.grace_days` | Days after due before `missed` |
| `obligation.horizon_days` | How far ahead obligations are generated |
| `payment.fee_bearer` | `merchant` (strict, default) or `customer`. Must match the provider dashboard. Changed only by holders of `admin.settings.update` (owner role), reauthenticated and audited. Anything else reads as `merchant` |
| `refund.enabled` | Refund gate, default off |
| `webhook.ip_allowlist_enabled` | Optional extra layer |

## 13. Threat model (money paths)

| Threat | Control | Test |
|--------|---------|------|
| Client claims a payment succeeded | No client route writes money state. Settlement only from provider verify | `client_cannot_settle` |
| Forged webhook | HMAC SHA512 on the raw body, constant time | `webhook.forged` |
| Replayed valid webhook | Dedupe key plus idempotent settlement, no double credit | `webhook.replay` |
| Double tap or retry storm | Idempotency key unique per member | `initiate.duplicate_tap` |
| Amount tampering | Server decides amount, verify amount must match | `settle.amount_mismatch` |
| Paying for another member's obligation | Ownership check on obligation and attempt | `initiate.not_owner` |
| Charging a card with another email | Stored authorization email only | `charge.uses_stored_email` |
| Secret or token leak | Redaction helper, `server-only`, response mappers | `no_secrets_in_responses` |
| Provider outage causing double charge | No auto retry on initialize or charge | `charge.no_auto_retry` |
| Negative balance by race | Repository locks balance row, service handles error | `ledger.no_negative` |

## 14. Test plan

- Unit and property tests colocated as `lib/**/*.test.ts`, using the repository interfaces with in memory doubles from `tests/payments/`.
- Property tests: any interleaving of duplicate taps, duplicate webhooks, callbacks and reconcile runs for one attempt yields at most one ledger credit and a legal state path. This needs `fast-check` (dependency handoff).
- Every row of the failure matrix and the threat table above has a named test.
- Provider contract tests: Zod schemas run against recorded response fixtures taken from the official docs examples.
- Sandbox suite (`tests/payments/sandbox/`, skipped without a test key): initialize, redirect pay, verify, charge authorization, refund, webhook delivery. Run by the Integrator or owner with a test key. It confirms the items listed unconfirmed in section 1.
- Database level invariants are AI-1's `tests/db/`. AI-4 supplies the list in the AI-1 handoff.

## 15. Milestones and evidence

Each milestone is one PR into `integration` with test output pasted in.

| M | Content | Evidence |
|---|---------|----------|
| M0 | This spec and the handoffs | Review |
| M1 | Pure domain: money helpers, schedule, time based obligation status, reference, receipt number and charge key generation, transition guards and settlement paths, the verification decision (A2, A3) | Unit tests, exhaustive calendar checks, mutation check, lint, typecheck |
| M2 | Provider interface, Paystack adapter, fake provider, fixtures from the official samples, the fee bearer setting in the verification decision | Adapter tests for every status mapping and request shape, mutation check, lint, typecheck |
| M3 | Payment service: initiate, settle, webhook processing, with in memory repositories | Full failure matrix tests |
| M4 | Saved cards, charge runner, retry policy, notifications | Runner crash and resume tests |
| M5 | Refunds, reversals, reconciliation, receipt service | Reconciliation tests |
| M6 | Route handlers, webhook route, job routes, payout service | Route tests, secret scan |

Before M3 I read the Next.js 16 route handler and `after` docs from `node_modules/next/dist/docs/`, as the shared rules require.

## 16. Assumptions and open questions

Assumptions I am building on (change them and tell me):
- Paystack, naira only, one owner admin, personal savings with withdrawal requests (ADR-001, 003, 004, 005).
- Admin initiated payouts, no Paystack Transfers API in v1.
- Only `card_authorization` saves a card.

Owner decisions needed (the engine builds them as configuration until answered):
- Q1: What a missed or failed scheduled contribution costs the member, if anything.
- Q2: Does adding a card charge a real amount? Default plan: it is a normal contribution of the member's chosen amount, credited to their balance with a receipt, so no refund flow is needed. Provider guidance suggests a minimum first charge near NGN 50, to be confirmed.
- Q3: Minimum and maximum contribution and any late fee.
- Q4: Refund policy and who may refund.
- Q5: Policy when a chargeback arrives after the member withdrew.
- Q6: Does the manual transfer channel stay (ADR-011). Nothing is built for it until decided.
- Q7 (answered by the owner): fee handling depends on the admin, so it is a setting, `payment.fee_bearer`, behind the `admin.settings.update` permission. The engine credits only the contribution amount in both modes. If the setting says `merchant` but the provider adds fees, the payment is held as an amount mismatch and not credited, which is loud on purpose. Whoever changes the dashboard fee option must change this setting in the same step.

Note: the Integrator's decisions file (`docs/handoffs/integrator-decisions-001.md`) answers AI-4's contract and database questions (also numbered Q1 to Q3 there: receipt number collisions, forged webhooks, settings seeds). It does not answer the owner questions Q1 to Q6 above. Those stay open and stay configuration. Check the file before building any rule, and treat the spec text above as superseded where they differ.

## 17. M3 payment service: decisions and findings

Written before the code. Scope of M3: `initiate`, `verifyAndSettle`, `getAttempt`, `listHistory`, the webhook service and the settlement core, against contracts v1.1.0, with in memory repositories under `tests/payments/`. Saved method charging (listing, removing, `paymentMethodId` on initiate) is M4. Refunds and reversal of credited payments are M5.

### 17.1 Provider facts re-checked for M3 (official page, 2026-11-19)
Confirmed on https://paystack.com/docs/payments/webhooks/: signature is HMAC SHA512 of the payload keyed with the secret key; events include `charge.success`, `charge.dispute.create`, `charge.dispute.remind`, `charge.dispute.resolve`, `refund.failed`, `refund.pending`, `refund.processed`, `refund.processing`. The official sample hashes `JSON.stringify(req.body)`. We verify the raw body instead, which is stricter. Still no documented event id. Confirmed from the initialize sample in the transaction docs: `authorization_url` is `https://checkout.paystack.com/` plus `access_code`, which is what lets a repeated tap rebuild the checkout link from the stored access code (CR-1). Not confirmed: the field names inside `refund.*` payloads (M3 does not read them), and whether `charge.success` payloads can ever lack `data.reference` (handled: ignored).

### 17.2 Decisions
1. **Entry points.** The member facing `verifyAndSettle` checks the caller owns the reference. Webhooks and reconciliation call the same settler with no ownership check. A null `actorId` is never treated as system, because a route that forgot to authenticate would also have a null actor.
2. **Not found and not owner both return `NOT_FOUND`** for obligations and attempts, so the response never reveals that another member's id exists. This replaces step 4 of section 5.1, which said `VALIDATION_FAILED`. Wrong status or amount stays `VALIDATION_FAILED` with the field named.
3. **Obligation double payment guard.** `initiate` rejects a new key for an obligation that already has an attempt in flight (`PAYMENT_DUPLICATE_IN_PROGRESS`), using `listByObligation`. Attempts with the same key pass through so a repeated tap still returns the same attempt. Two different keys racing past the check cannot be stopped in code. The fix is a partial unique index on in flight attempts per obligation (handoff to AI-1). Until then both could be credited, which is the member's own money going to the member's own balance, and the obligation is paid once.
4. **Initialize outcomes.** Refused by the provider (`definitelyNotProcessed`): attempt goes to `failed`, answer `PAYMENT_PROVIDER_UNAVAILABLE`. Timeout or unreadable answer: attempt stays `initiating`, answer `PAYMENT_PROVIDER_TIMEOUT`. Network error, 5xx or 429: attempt stays `initiating`, answer `PAYMENT_PROVIDER_UNAVAILABLE`. A checkout link is the only way money moves in the hosted flow and we return a link only after the provider answers, so none of these can have moved money. Known limitation: a repeated tap on a stuck `initiating` attempt answers `PAYMENT_DUPLICATE_IN_PROGRESS` until the attempt expires.
5. **Checkout host check.** The authorization URL must be https, carry no credentials or port, and have a host in `payment.allowed_checkout_hosts` (CR-10, still a request, so the default `checkout.paystack.com` applies when the setting is missing). A URL that fails the check fails the attempt, and the member is never redirected to it.
6. **Settings failures never decide money.** If the fee bearer setting cannot be read, settlement answers `SYSTEM_UNAVAILABLE` and leaves the attempt as it is. Falling back to `merchant` there would fail a real customer paid payment for good.
7. **Verify failures.** Timeout, unreadable answer or provider outage: attempt stays `verifying`, answer `PAYMENT_PROVIDER_TIMEOUT` (money moved: unknown). Our key refused: `SYSTEM_UNAVAILABLE`. The provider has no record of the reference: step back to `processing` and wait for expiry.
8. **Mismatch and reversed before credit.** A discrepancy record is written first, then the attempt goes to `failed` (`PROVIDER_VERIFY_MISMATCH` or `PAYMENT_REVERSED`), nothing is credited. If the record cannot be written the attempt stays `verifying` and is retried, so a mismatch is never dropped silently. Operational note: a wrong `payment.fee_bearer` setting fails real payments terminally. The way out is an admin adjustment reviewed through the discrepancy record. Reversal of an already credited attempt is M5.
9. **Obligation anomalies do not block the credit.** The money is real, so the credit stands. An obligation that is missing, cancelled, or already paid by a different attempt opens a discrepancy record.
10. **Events.** Every transition emits `payment.status_changed`, published only by the caller that won that compare and set (A5). Event or notification failures are logged and never fail settlement. There is no transactional outbox, so a crash between a commit and its event loses that event (for example `ledger.entry_posted` when the process dies right after the credit commits, because the rerun sees `created: false`). State is never lost and an event is never published twice by one transition. Consumers must treat events as hints and reconciliation as the check.
11. **Webhook storage is sanitized.** `charge.success` bodies carry the authorization code and card signature. The stored `rawPayload` keeps an allowlist of scalar fields (event, id, reference, status, amount, currency, channel, paid_at, gateway_response, fees) plus the SHA 256 of the raw body, so no card reference sits in `payment_events`. This differs from the contract comment "raw body exactly as received". Raised with the Integrator in the handoff.
12. **Duplicate webhooks reprocess unfinished events.** A duplicate whose stored event is not processed, or is processed with an error, runs again. Safe because settlement is idempotent. This needs `listUnprocessed` to return both kinds (handoff to AI-1, requirement 13).
13. **Events by type.** `charge.success` settles by reference, ignoring the body amount (A3). `refund.*` events are stored and left unprocessed until M5. Everything else, including `charge.dispute.*`, is stored and marked processed with no action.
14. **Receipt collision error.** The Integrator said `post` throws a typed error and the code `LEDGER_RECEIPT_CONFLICT` would be added if missing. It is not in `contracts/errors.ts` or `v1_1.ts` yet, so the service recognises an error whose `code` is `LEDGER_RECEIPT_CONFLICT` without importing a type. Handoff asks the Integrator to add the code.
15. **Open requests built around, not on.** CR-8 (receipt number on history), CR-9 (`getLimits`) and CR-10 (return route, allowed hosts setting) are not in v1.1.0. M3 uses only v1.1.0 types and keeps `listHistory` at the frozen return type.

### 17.3 Failure matrix additions
| Case | What happens | Final state | Test |
|------|--------------|-------------|------|
| Crash after obligation update, before status flip | rerun repeats credit lookup, obligation and method, then flips | successful | `settle.crash_after_obligation` |
| Receipt number collision, twice then free | retried with new numbers, one credit | successful | `settle.receipt_collision` |
| Receipt number collision three times | nothing credited, attempt stays verifying | verifying | `settle.receipt_collision` (gives up after three) |
| Settings unreadable during settlement | nothing changes, answer unavailable | unchanged | `settle.settings_unavailable` |
| Obligation still scheduled when paid | goes scheduled, due, paid | successful | `settle.obligation_scheduled` |
| Obligation already paid by another attempt | credit stands, discrepancy opened | successful | `settle.obligation_paid_elsewhere` |
| Discrepancy record cannot be written | attempt stays verifying, retried | verifying | `settle.discrepancy_write_fails` |
| Provider reports reversed before credit | no credit, discrepancy, failed | failed | `settle.reversed_before_credit` |
| Different key, same obligation, first in flight | `PAYMENT_DUPLICATE_IN_PROGRESS` | unchanged | `initiate.obligation_in_flight` |
| Authorization URL on a foreign host | attempt failed, no redirect | failed | `initiate.foreign_checkout_host` |
| Repeated tap after the link was issued | same attempt, link rebuilt from stored access code | awaiting_authentication | `initiate.repeat_after_link` |
| Valid signature, card data in body | stored payload has no authorization or card fields | unchanged | `webhook.no_card_data_stored` |
| Duplicate of an event that failed processing | processed again, one credit | successful | `webhook.duplicate_reprocesses_failed` |
| Valid signature, body not JSON | stored with the body hash, marked processed with no error (retrying cannot help), no action | unchanged | `webhook.unparseable_body` |
| Forged flood | 401 each time, security events rate limited | unchanged | `webhook.forged_rate_limited` |

