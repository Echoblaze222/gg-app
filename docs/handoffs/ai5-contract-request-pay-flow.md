# ai5 contract request: pay flow

From: AI-5. To: Integrator, AI-4, AI-2. Base: `integration` @ 2678e0e082b8, contracts v1.0.0. Additive only.

## 1. No return route for the provider redirect (blocks the redirect flow)
`contracts/routes.md` has `/app/pay` but no page the provider can return to. The provider redirects to the `callback_url` set when the transaction is initialized and appends `trxref` and `reference` (RESEARCHED, see `docs/product/04-pay-flow-design.md`).
Request: add `/app/pay/return`, owner AI-5, permission `member.payment.create`, and have AI-4 set `callback_url` to that route. The page reads the reference with `lib/payments/callback.ts`, verifies through `PaymentService.verifyAndSettle`, then confirms with `getAttempt`.

## 2. Replay of `initiate` with the same key
The client repeats the same key after a lost reply. Please confirm and document what `initiate` returns in each case:
- attempt still `initiating` or `awaiting_authentication`: same attempt and a usable `authorizationUrl`?
- attempt already past the provider page (provider URLs are single use): attempt with `authorizationUrl: null`, so the client goes to `confirming` and never to a dead page?
- attempt already final: the same final attempt (the client then releases the key)?

## 3. Business limits are not readable by the member screen
Minimum and maximum contribution live in `SettingsRepository`. Neither the pay screen nor the plan screen can read them, so the member only learns the limit after the server rejects the amount.
Request: add a read method, for example `ContributionService.getLimits(ctx): Promise<Result<{ minKobo: Kobo; maxKobo: Kobo }>>`.

## 4. Polling load
After the provider redirect the client polls `getAttempt` at most 7 times in about 53 seconds (1, 2, 3, 5, 8, 13, 21 seconds, plus or minus 20 percent), then stops. Please confirm the rate limit rule for `verifyAndSettle` and `getAttempt` leaves room for that, plus a few manual "check again" presses.

## 5. Allowed payment host and reference format
The client only redirects to an https host on an allow list (default `checkout.paystack.com`) and only verifies references matching 6 to 100 characters of letters, digits, `.`, `_`, `=`, `-`. Please confirm both against what AI-4 sends, or tell me the real values. The host list should become configuration (AI-1, `contracts/env.md`).
