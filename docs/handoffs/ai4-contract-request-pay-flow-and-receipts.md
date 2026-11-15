# AI-4 contract request: pay flow, receipts and bank directory

From: AI-4. To: Integrator. Additive only. Continues `ai4-contract-request-additions.md` (CR-1 to CR-7).
These follow from AI-5 requests (`ai5-contract-request-pay-flow.md`, `ai5-contract-request-receipt-link.md`, `ai5-contract-request-product-gaps.md` item 7).

## CR-8: receipt number on history items
Problem: a history row for a successful payment cannot link to its receipt, because the number lives only on the ledger entry.
Change:
- New type `PaymentHistoryItem = PaymentAttempt & { receiptNumber: string | null }`.
- `PaymentService.listHistory` returns `Page<PaymentHistoryItem>`.
- `LedgerRepository.listReceiptsByAttempts(attemptIds: Uuid[]): Promise<Array<{ paymentAttemptId: Uuid; receiptNumber: string }>>`. At most 100 ids per call. One query, no per row lookups. Only `contribution_credit` entries.
Breaking note: the return type of `listHistory` widens by one field, so existing callers keep working.

## CR-9: member readable limits
Change: `ContributionService.getLimits(ctx: RequestContext): Promise<Result<{ minKobo: Kobo; maxKobo: Kobo }>>`. Needs `member.payment.create`. Returns `SYSTEM_UNAVAILABLE` when either setting is missing. Reads `contribution.min_kobo` and `contribution.max_kobo`.

## CR-10: return route and allowed checkout hosts
Change:
- Add route `/app/pay/return` to `contracts/routes.md` (owner AI-5, permission `member.payment.create`). AI-4 sends it as the provider `callback_url`, built from `NEXT_PUBLIC_APP_URL`.
- Add setting `payment.allowed_checkout_hosts` (list of host names, default `checkout.paystack.com`) to the settings list. AI-1 seeds it. AI-4 checks it server side before returning an authorization URL and AI-5 uses the same list on the client.

## CR-11: bank directory for withdrawals
Problem: withdrawal screens need a bank list and an account name check. No contract covers it.
Change: new service in `services.ts`, owner AI-4.
```ts
export interface BankDirectory {
  listBanks(ctx: RequestContext): Promise<Result<Array<{ code: string; name: string }>>>;
  resolveAccount(ctx: RequestContext, input: { bankCode: string; accountNumber: string }): Promise<Result<{ accountName: string }>>;
}
```
Permission `member.payout.request`. `resolveAccount` is rate limited per member, and the account number is never logged. Built in the last milestone. Open point: Paystack's cost and limits for account resolution are not yet confirmed. Nothing is built until they are.
