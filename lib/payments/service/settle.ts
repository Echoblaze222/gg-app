/**
 * Settlement: the one function that turns provider truth into ledger truth.
 * Callers: the member's return route, the webhook service, and reconciliation. All three run this code,
 * so they cannot disagree (spec section 5.2).
 *
 * Order matters and is tested:
 *   1. verify with the provider (never a webhook body or a client value, A3)
 *   2. decide with evaluateVerification (A2)
 *   3. credit the ledger (idempotent on the attempt id)
 *   4. mark the obligation paid, save the card (both repeatable)
 *   5. only then flip the attempt to `successful`
 * Everything before step 5 is repeatable, and the attempt stays non terminal until step 5, so a crash anywhere
 * leaves something the next run finishes. A1: `successful` never exists without its credit.
 */
import type { ObligationStatus, PaymentAttemptStatus } from "@/contracts/enums";
import { ERROR_DEFINITIONS, type ErrorCode, type Result } from "@/contracts/errors";
import type { LedgerEntryV11, PaymentAttemptV11 } from "@/contracts/v1_1";
import type { RequestContext } from "@/contracts/services";
import { formatNairaPlain } from "@/lib/ledger/money";
import { generateReceiptNumber } from "../reference";
import type { ProviderFailure, ProviderTransaction } from "../provider/types";
import { isSettlementClosed, pathToPaid, pathToVerifying } from "../transitions";
import { FEE_BEARER_SETTING_KEY, evaluateVerification, parseFeeBearer, type FeeBearer } from "../verification";
import type { PaymentServiceDeps } from "./deps";
import { createEmitter } from "./emitter";
import { fail, failFromThrown, ok, thrownKind } from "./results";

export interface Settler {
  /** Looks the attempt up by reference and settles it. NOT_FOUND for an unknown reference. No ownership check. */
  settleByReference(ctx: RequestContext, reference: string): Promise<Result<PaymentAttemptV11>>;
  /** Settles an attempt the caller already loaded and, if needed, authorised. */
  settleAttempt(ctx: RequestContext, attempt: PaymentAttemptV11): Promise<Result<PaymentAttemptV11>>;
}

type TransitionPatch = { providerTransactionId?: string; failureCode?: string };

/** Most attempts at a unique receipt number before giving up (Integrator decision, integrator-decisions-001 Q1). */
export const MAX_RECEIPT_ATTEMPTS = 3;

/**
 * `LedgerRepository.post` signals a receipt number collision with a typed error. The code is not in the frozen
 * error list yet (handoff asks the Integrator to add it), so it is recognised by its `code` without a type import.
 */
function isReceiptConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "LEDGER_RECEIPT_CONFLICT";
}

const MISMATCH_NOTE: Record<"reference" | "currency" | "amount", string> = {
  reference: "provider_answer_for_other_reference",
  currency: "provider_currency_differs",
  amount: "provider_amount_differs",
};

export function createSettler(deps: PaymentServiceDeps): Settler {
  const { repos, provider, log } = deps;
  const emit = createEmitter(deps);

  async function reread(ctx: RequestContext, attemptId: string): Promise<Result<PaymentAttemptV11>> {
    const fresh = await repos.attempts.getById(attemptId);
    return fresh ? ok(fresh) : fail("NOT_FOUND", ctx.requestId);
  }

  /** One compare and set. Publishes the status change only when this caller won it (A5). Null means someone else moved it. */
  async function move(
    ctx: RequestContext,
    from: PaymentAttemptV11,
    to: PaymentAttemptStatus,
    patch?: TransitionPatch,
  ): Promise<PaymentAttemptV11 | null> {
    const next = await repos.attempts.transition(from.id, from.status, to, patch);
    if (next === null) return null;
    await emit.publish(ctx, "payment.status_changed", { attemptId: from.id, memberId: from.memberId, from: from.status, to });
    return next;
  }

  async function openDiscrepancy(attempt: PaymentAttemptV11, note: string, providerKobo: number | null): Promise<void> {
    const { runId } = await repos.reconciliation.startRun();
    const record = await repos.reconciliation.record({
      runId,
      paymentAttemptId: attempt.id,
      providerReference: attempt.reference,
      status: "discrepancy",
      expectedKobo: attempt.amountKobo,
      providerKobo,
      note,
    });
    await emit.publish({ requestId: runId, actorId: null, ip: null, userAgent: null }, "reconciliation.discrepancy_found", { recordId: record.id, runId });
  }

  async function postCredit(attempt: PaymentAttemptV11): Promise<{ entry: LedgerEntryV11; created: boolean }> {
    for (let n = 1; ; n += 1) {
      const receiptNumber = generateReceiptNumber(deps.now(), deps.randomBytes);
      try {
        return await repos.ledger.post({
          memberId: attempt.memberId,
          entryType: "contribution_credit",
          amountKobo: attempt.amountKobo,
          paymentAttemptId: attempt.id,
          receiptNumber,
        });
      } catch (err) {
        if (isReceiptConflict(err) && n < MAX_RECEIPT_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  /**
   * Marks the attempt's obligation paid. The credit stands whatever happens here, because the money is real:
   * an obligation that cannot be paid opens a discrepancy instead of failing settlement.
   * A lost race that leaves the obligation in some other state throws, so the attempt stays `verifying`
   * and the next run converges.
   */
  async function markObligationPaid(attempt: PaymentAttemptV11): Promise<void> {
    if (attempt.obligationId === null) return;
    const obligation = await repos.obligations.getById(attempt.obligationId);
    if (obligation === null) {
      await openDiscrepancy(attempt, "obligation_missing", null);
      return;
    }
    if (obligation.status === "paid") {
      if (obligation.paidByAttemptId !== attempt.id) await openDiscrepancy(attempt, "obligation_paid_by_other_attempt", null);
      return;
    }
    const path = pathToPaid(obligation.status);
    if (path === null) {
      await openDiscrepancy(attempt, `obligation_not_payable_${obligation.status}`, null);
      return;
    }
    let current: ObligationStatus = obligation.status;
    for (const step of path) {
      const moved = await repos.obligations.transition(obligation.id, current, step, step === "paid" ? attempt.id : undefined);
      if (moved === null) {
        const again = await repos.obligations.getById(obligation.id);
        if (again?.status === "paid") {
          if (again.paidByAttemptId !== attempt.id) await openDiscrepancy(attempt, "obligation_paid_by_other_attempt", null);
          return;
        }
        throw new Error("obligation_transition_conflict");
      }
      current = step;
    }
  }

  /** Saves a reusable card from a verified `card_authorization` payment (A6). Publishes only when a new method was stored. */
  async function saveMethodIfAny(ctx: RequestContext, attempt: PaymentAttemptV11, tx: ProviderTransaction): Promise<void> {
    const auth = tx.authorization;
    if (attempt.purpose !== "card_authorization" || auth === null || auth.reusable !== true) return;
    const member = await repos.members.getById(attempt.memberId);
    const email = (tx.customerEmail ?? member?.email ?? "").trim().toLowerCase();
    if (email === "") throw new Error("no_email_for_authorization");
    const { method, created } = await repos.methods.saveIfNew({
      memberId: attempt.memberId,
      providerAuthorizationRef: auth.authorizationCode,
      providerCardSignature: auth.signature,
      brand: auth.brand,
      last4: auth.last4,
      expMonth: parseExpiryMonth(auth.expMonth),
      expYear: parseExpiryYear(auth.expYear),
      bank: auth.bank,
      reusable: true,
      authorizationEmail: email,
    });
    if (created) await emit.publish(ctx, "payment_method.saved", { paymentMethodId: method.id, memberId: attempt.memberId });
  }

  async function completeSuccess(ctx: RequestContext, attempt: PaymentAttemptV11, tx: ProviderTransaction): Promise<Result<PaymentAttemptV11>> {
    const { entry, created } = await postCredit(attempt);
    if (entry.receiptNumber === null) throw new Error("credit_without_receipt_number");
    if (created) {
      await emit.publish(ctx, "ledger.entry_posted", { entryId: entry.id, memberId: entry.memberId, entryType: entry.entryType, amountKobo: entry.amountKobo });
    }
    await markObligationPaid(attempt);
    await saveMethodIfAny(ctx, attempt, tx);

    const done = await move(ctx, attempt, "successful", { providerTransactionId: tx.providerTransactionId });
    if (done === null) return reread(ctx, attempt.id);

    await emit.publish(ctx, "payment.succeeded", { attemptId: attempt.id, memberId: attempt.memberId, amountKobo: attempt.amountKobo, receiptNumber: entry.receiptNumber });
    await emit.notify(ctx, {
      memberId: attempt.memberId,
      type: "payment_successful",
      title: "Payment received",
      body: `NGN ${formatNairaPlain(attempt.amountKobo)} was added to your savings. Receipt ${entry.receiptNumber}.`,
      link: `/app/history/${attempt.id}`,
    });
    return ok(done);
  }

  async function closeFailed(
    ctx: RequestContext,
    attempt: PaymentAttemptV11,
    failureCode: ErrorCode,
    tx: ProviderTransaction,
    memberCopy: { title: string; body: string },
  ): Promise<Result<PaymentAttemptV11>> {
    const done = await move(ctx, attempt, "failed", { failureCode, providerTransactionId: tx.providerTransactionId });
    if (done === null) return reread(ctx, attempt.id);
    await emit.publish(ctx, "payment.failed", { attemptId: attempt.id, memberId: attempt.memberId, failureCode });
    await emit.notify(ctx, { memberId: attempt.memberId, type: "payment_failed", ...memberCopy, link: `/app/history/${attempt.id}` });
    return ok(done);
  }

  async function stepBackToProcessing(ctx: RequestContext, attempt: PaymentAttemptV11, tx: ProviderTransaction): Promise<Result<PaymentAttemptV11>> {
    const back = await move(ctx, attempt, "processing", { providerTransactionId: tx.providerTransactionId });
    return back ? ok(back) : reread(ctx, attempt.id);
  }

  async function onVerifyFailure(ctx: RequestContext, attempt: PaymentAttemptV11, failure: ProviderFailure): Promise<Result<PaymentAttemptV11>> {
    switch (failure.kind) {
      case "not_found": {
        // The provider never saw the reference (nobody opened checkout). Nothing was paid. Wait for expiry.
        const back = await move(ctx, attempt, "processing");
        return back ? ok(back) : reread(ctx, attempt.id);
      }
      case "unauthorized":
      case "rejected":
        log.error("settle.provider_refused", { attemptId: attempt.id, kind: failure.kind });
        return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
      default:
        // timeout, unavailable, malformed: the outcome is unknown. The attempt stays `verifying` for the next run.
        log.warn("settle.verify_unknown_outcome", { attemptId: attempt.id, kind: failure.kind });
        return fail("PAYMENT_PROVIDER_TIMEOUT", ctx.requestId);
    }
  }

  async function run(ctx: RequestContext, start: PaymentAttemptV11): Promise<Result<PaymentAttemptV11>> {
    if (isSettlementClosed(start.status)) return ok(start);

    // Read the setting before touching any state: a failed read must leave the attempt exactly as it was.
    let feeBearer: FeeBearer;
    try {
      feeBearer = parseFeeBearer(await repos.settings.get(FEE_BEARER_SETTING_KEY));
    } catch (err) {
      log.warn("settle.settings_unavailable", { attemptId: start.id, kind: thrownKind(err) });
      return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
    }

    const path = pathToVerifying(start.status);
    if (path === null) return ok(start);
    let attempt = start;
    for (const step of path) {
      const next = await move(ctx, attempt, step);
      if (next === null) return reread(ctx, attempt.id); // someone else is settling
      attempt = next;
    }

    const verified = await provider.verify(attempt.reference);
    if (!verified.ok) return onVerifyFailure(ctx, attempt, verified.error);
    const tx = verified.value;

    const decision = evaluateVerification(
      { reference: attempt.reference, amountKobo: attempt.amountKobo, currency: attempt.currency },
      {
        reference: tx.reference,
        status: tx.status,
        amountKobo: tx.amountKobo,
        currency: tx.currency,
        requestedAmountKobo: tx.requestedAmountKobo,
        feesKobo: tx.feesKobo,
      },
      feeBearer,
    );

    switch (decision.kind) {
      case "settle":
        return completeSuccess(ctx, attempt, tx);
      case "fail":
        return closeFailed(ctx, attempt, decision.failureCode, tx, {
          title: "Payment not completed",
          body: `${ERROR_DEFINITIONS[decision.failureCode].message} ${ERROR_DEFINITIONS[decision.failureCode].action}`,
        });
      case "wait":
        return stepBackToProcessing(ctx, attempt, tx);
      case "mismatch":
        // Record first. If the record cannot be written this throws and the attempt stays `verifying`, so a mismatch is never dropped.
        await openDiscrepancy(attempt, MISMATCH_NOTE[decision.reason], tx.amountKobo);
        return closeFailed(ctx, attempt, "PROVIDER_VERIFY_MISMATCH", tx, {
          title: "Payment under review",
          body: "We could not match this payment with our payment provider yet. Our team is reviewing it. Check your history before paying again.",
        });
      case "reversed":
        // Reversal of an already credited attempt is handled in M5. Here nothing was credited.
        await openDiscrepancy(attempt, "provider_reports_reversed_before_credit", tx.amountKobo);
        return closeFailed(ctx, attempt, "PAYMENT_REVERSED", tx, {
          title: "Payment reversed",
          body: `${ERROR_DEFINITIONS.PAYMENT_REVERSED.message} ${ERROR_DEFINITIONS.PAYMENT_REVERSED.action}`,
        });
    }
  }

  async function settleAttempt(ctx: RequestContext, attempt: PaymentAttemptV11): Promise<Result<PaymentAttemptV11>> {
    try {
      return await run(ctx, attempt);
    } catch (err) {
      log.error("settle.unexpected", { attemptId: attempt.id, kind: thrownKind(err) });
      return failFromThrown(err, ctx.requestId);
    }
  }

  return {
    settleAttempt,
    async settleByReference(ctx, reference) {
      try {
        const attempt = await repos.attempts.getByReference(reference);
        if (attempt === null) return fail("NOT_FOUND", ctx.requestId);
        return await settleAttempt(ctx, attempt);
      } catch (err) {
        log.error("settle.lookup_failed", { kind: thrownKind(err) });
        return failFromThrown(err, ctx.requestId);
      }
    },
  };
}

/** Paystack sends expiry as text. Anything outside a real month or a four digit year is stored as unknown, never guessed. */
function parseExpiryMonth(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const month = Number(value);
  return month >= 1 && month <= 12 ? month : null;
}

function parseExpiryYear(value: string | null): number | null {
  if (value === null || !/^\d{4}$/.test(value)) return null;
  return Number(value);
}
