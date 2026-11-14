# AI-4 contract request: additive changes to contracts v1.0.0

From: AI-4. To: Integrator. Type: additive only, no frozen item changed or removed. Needs a minor version bump.

Each item is something the payments design cannot do correctly without it. Spec section references are in `docs/payments/00-spec.md`.

## CR-1: store the provider access code on a payment attempt
Problem: if the member taps again after the first response was lost, we must return the same checkout URL. The provider rejects a second initialize with the same reference, and `PaymentAttempt` has nowhere to keep the code.
Change: add `providerAccessCode: string | null` to `PaymentAttempt`, and `providerAccessCode?: string` to the `patch` of `PaymentAttemptRepository.transition`. Server side only. The checkout URL is `https://checkout.paystack.com/<access_code>` per the provider docs samples, to be confirmed in sandbox.
If refused: a repeat tap on an attempt in `initiating` returns `PAYMENT_DUPLICATE_IN_PROGRESS`. Works, worse experience.

## CR-2: balance after each ledger entry
Problem: `ReceiptData.balanceAfterKobo` must be an immutable snapshot. Computing it later from the current balance gives a different number as the ledger grows.
Change: add `balanceAfterKobo: Kobo` to `LedgerEntry`, set by `LedgerRepository.post` inside the locked transaction.

## CR-3: attempts by obligation
Problem: the charge retry policy needs the number of attempts already made for an obligation.
Change: add `listByObligation(obligationId: Uuid): Promise<PaymentAttempt[]>` to `PaymentAttemptRepository`.

## CR-4: list active plans
Problem: obligation generation must walk all active plans. `PlanRepository` only lists by member.
Change: add `listActive(page: PageRequest): Promise<Page<ContributionPlan>>` to `PlanRepository`.

## CR-5: refunds by attempt
Problem: the rule that refunds for one attempt never exceed its amount, and mapping provider refund events back to a refund, need the refunds of an attempt.
Change: add `listByAttempt(paymentAttemptId: Uuid): Promise<Refund[]>` to `RefundRepository`.

## CR-6: clarify `ObligationRepository.listDue`
Question rather than a change. I will read it as: obligations with status `scheduled` or `due` and `dueOn <= onOrBefore`, oldest first. Please confirm or correct the comment in the contract.

## CR-7: payout OTP storage (needed only for the last milestone)
Problem: `PayoutService.sendOtp` and `verifyOtp` need a place for a hashed, expiring, attempt limited code. No repository covers it.
Change: an `OtpRepository` or columns on the payout, owner of the choice is AI-1. The code is hashed with `OTP_PEPPER`, never stored in clear text.
