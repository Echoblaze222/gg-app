# Pay flow design (M4a)

Base: `integration` @ 2678e0e082b8 (PR #4 merged my plan and the notification layer). Branch `ai/5-product` also holds M3. Status: logic layer pushed, tests written, NOT executed (no network or CI connector in the authoring session). No screens yet.

Labels: VERIFIED = read in the repo. RESEARCHED = from outside sources, not the official provider docs. ASSUMED = needs a check. OPEN = needs a decision.

## 1. Research (step 2 of the protocol)
- RESEARCHED (SDK READMEs and integration guides, official docs page not opened): the provider redirects the member back to the callback URL and appends `trxref` and `reference` with the same value. The authorization URL is for one time use. A redirect proves nothing, because anyone can type the callback URL by hand, so the server must verify the reference with the provider before giving value. Verify statuses seen: success, failed, abandoned.
- VERIFIED in the pack: never use optimistic UI to show money as received. Handle duplicate taps, network interruption, provider timeout, abandoned checkout, pending payment, reversed payment.
- VERIFIED in the contracts: payment states and their allowed transitions, `retrySafe` and `moneyMoved` on every error, idempotency key rules (16 to 64 characters, letters, digits, dash, underscore), and `IDEMPOTENCY_KEY_REUSED` for the same key with different details.

## 2. Model: what can go wrong
| Threat | Defense in this layer |
|--------|-----------------------|
| Double tap or two tabs | One idempotency key per intent, kept in storage, same key on every repeat. Reducer ignores submit while busy |
| Reply lost after the server charged | Same key repeated returns the same attempt. Unknown outcome keeps the key |
| Stuck on an old failed attempt | Key released after any final outcome, so the next try gets a new key. Keys also expire after 2 hours |
| Changed amount with same key | Fingerprint includes amount, purpose, obligation, method and channel, so a changed intent gets a new key |
| Fake redirect with a made up reference | Redirect only picks the reference. Success needs a server attempt with status `successful` |
| Verification call fails and the page says "failed" | Verify failures become `outcome_unknown`, never `failed`. The member is told not to pay again |
| Member retries after a verify problem and pays twice | From that state `submit` is blocked. Only `verify_again` works |
| Late poll response overwrites a newer state | Final states ignore updates. In progress states ignore moves that are not reachable in the contract state machine |
| Poisoned callback URL | Strict reference format, repeated or mismatched parameters rejected, no lookup on invalid input |
| Open redirect to a fake payment page | Redirect only to https on an allowed host, no credentials, no port |
| Polling storm | 7 polls with backoff and jitter, about 53 seconds, then an honest pending message |

## 3. States
`editing` (idle) to `submitting` to `redirecting` (provider page) or `confirming` (saved method, or back from provider), then `succeeded`, `failed`, `outcome_unknown` or `still_pending`.
The redirect is a full page load, so the return page starts fresh in `confirming` from the reference in the URL. It cannot rely on earlier state.

| Outcome | Money | Retry | Key |
|---------|-------|-------|-----|
| Successful | received | none | released |
| Failed, cancelled, expired | not charged | new attempt | released |
| Reversed | moved back | none | released |
| Initiate error, money no, retry safe | not charged | new attempt | released |
| Initiate error, money no, retry unsafe | not charged | none | released |
| Initiate error, money yes | moved | none | released |
| Initiate error, money unknown | unknown | repeat only if the error says it is safe | kept |
| No reply at all | unknown | repeat with same key | kept |
| Verify problem or still pending | unknown | verify again, never a new payment | kept |

## 4. Module map
`intent.ts` (intent, fingerprint, input builder), `idempotency.ts` (key store and per intent keys), `callback.ts` (return parsing, safe redirect check), `poll.ts` (schedule), `pay-flow.ts` (reducer and copy).

## 5. Authorization
`/app/pay` needs `member.payment.create`. Enforced by `PaymentService` on the server. The reducer holds no permission logic.

## 6. Open items and assumptions
- ASSUMED: allowed payment host is `checkout.paystack.com`. Move it to configuration with AI-1 and confirm with AI-4.
- ASSUMED: reference format is 6 to 100 characters from letters, digits, `.`, `_`, `=`, `-`. AI-4 owns it.
- OPEN: there is no route for the provider to return to. `routes.md` has `/app/pay` only. See `docs/handoffs/ai5-contract-request-pay-flow.md`.
- OPEN: what `initiate` returns when the same key is replayed after the provider URL was already used.
- OPEN: business limits (minimum and maximum contribution) are not readable by the member screen. The server enforces them and returns `CONTRIBUTION_OUT_OF_RANGE`, but the screen cannot show limits before the member types.
- Known residual risk: if the provider URL is rejected as unsafe, the server attempt stays in progress until it expires. A new attempt for the same obligation may get `PAYMENT_DUPLICATE_IN_PROGRESS` until then.
- Not built yet: the screen, the controller that calls the services and the polling timer, and the browser wiring. They need AI-3 components and the AI-4 service implementation.
