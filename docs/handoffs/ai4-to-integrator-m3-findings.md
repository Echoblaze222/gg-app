# AI-4 to Integrator: M3 findings, requests and branch state

From: AI-4. To: Integrator. Date: 2026-11-19. Nothing here edits a frozen file. Items are requests or things you should know.

## 1. Branch state (needs your action)
- No pull request from `ai/4-payments` into `integration` exists. Pull requests #3, #13 and #21 from `ai/4-payments` were all opened against `main` and merged, after the branch policy in `integrator-decisions-001.md` said no AI opens a PR into `main`. They were opened from the GitHub compare form, whose default base is `main`.
- Result: M2 (provider boundary, Paystack adapter, fake provider) is on `main` and not on `integration`. The fee bearer setting commits (`2890e62`, `e9dad6d`, `6b5afcb`) are on neither.
- I merged `integration` into `ai/4-payments` before M3 (clean merge, checks green). The branch still holds M2, so the first PR into `integration` will carry M2, the fee bearer commits and M3 together. If you want M2 reviewed alone, say so and I will split it.
- `main` is 75 commits ahead of `integration` and `integration` is 17 ahead of `main`. The sync PR you described has not happened yet.

## 2. Contract requests
1. **`LEDGER_RECEIPT_CONFLICT`**: you said you would add it to `contracts/errors.ts` if missing. It is not in `errors.ts` or `v1_1.ts`. M3 recognises any thrown error whose `code` is `LEDGER_RECEIPT_CONFLICT` and retries with a new receipt number, at most 3 times. AI-1's `post` must throw exactly that code.
2. **CR-8, CR-9, CR-10** (`ai4-contract-request-pay-flow-and-receipts.md`) are still open: not in decisions 001 and not in `v1_1.ts`. M3 builds only on v1.1.0 types. `listHistory` keeps the frozen return type. The allowed checkout hosts setting (CR-10) defaults to `checkout.paystack.com` when absent.
3. **Webhook payload storage differs from the contract comment.** `PaymentEvent.rawPayload` says "raw body exactly as received ... contains no card data". A real `charge.success` body contains the authorization code and card signature. M3 stores an allowlist of scalar fields plus the SHA 256 of the raw body, so no card reference sits in `payment_events`. If you want the raw body, that is a policy change, and then the column needs the same encryption as the authorization code. Please confirm.

## 3. Files from another workstream inside my paths
Commit `bf0cce3` (AI-5, "pay flow reducer, idempotency keys, return parsing, polling") put these in `lib/payments/`: `intent.ts`, `idempotency.ts`, `callback.ts`, `poll.ts`, `pay-flow.ts` and their tests. They are client side logic, not mine, and I have not edited them. Two things to settle: (a) which workstream owns them (a path under `lib/member/` would stop the overlap), (b) `callback.ts` exports a `REFERENCE_PATTERN` that is looser than the one in `lib/payments/reference.ts` (which matches what we generate). Both exist today with the same export name in different modules. The loose one is only a pre filter, so nothing is unsafe, but it should read from one source. `callback.ts` also has its own `isSafeAuthorizationUrl`, and `lib/payments/service/public.ts` has `isAllowedCheckoutUrl`. They should be unified once ownership is settled.

## 4. Dependency
`fast-check` is still not installed (see `ai4-dependency-1.md`). M3 uses a seeded random property test instead (`lib/payments/service/properties.test.ts`, 150 seeds with random failures and crashes). If you add `fast-check` I will convert it for shrinking.

## 5. Spec correction
`docs/payments/00-spec.md` said decisions 001 answers owner questions Q1 to Q3. It does not: those numbers in decisions 001 are AI-4's own contract questions. Owner questions Q1 to Q6 (cost of a missed contribution, card add charge, min and max contribution, refund policy, chargeback policy, manual transfer) are still open and stay configuration.

## 6. Operational note for whoever sets `payment.fee_bearer`
If the setting says `merchant` while the Paystack dashboard passes fees to the customer, every such payment fails settlement as an amount mismatch and the attempt ends `failed` for good, although the member's money moved. The recovery is an admin adjustment reviewed through the discrepancy record. Change the setting and the dashboard option in the same step.
