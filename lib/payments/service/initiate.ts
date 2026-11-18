/**
 * PaymentService.initiate (spec section 5.1). Hosted checkout only in M3. Saved cards are M4.
 *
 * Order: permission, rate limit, validation, member state, limits (fail closed), obligation checks,
 * in flight guard, create idempotent, provider initialize, host check, compare and set, event.
 * No automatic retry on initialize. A repeated tap never calls the provider a second time for the same reference.
 */
import type { ContributionObligation, Uuid } from "@/contracts/entities";
import type { PaymentAttemptStatus } from "@/contracts/enums";
import { AppError, type ErrorCode, type Result } from "@/contracts/errors";
import { initiatePaymentInputSchema } from "@/contracts/schemas";
import type { InitiatePaymentInput, InitiatePaymentOutput, RequestContext } from "@/contracts/services";
import type { PaymentAttemptV11 } from "@/contracts/v1_1";
import { generateReference } from "../reference";
import type { ProviderFailure } from "../provider/types";
import {
  PAYMENT_INITIATE_RULE,
  SETTING_ALLOWED_CHECKOUT_HOSTS,
  SETTING_MAX_KOBO,
  SETTING_MIN_KOBO,
  type PaymentServiceDeps,
} from "./deps";
import { createEmitter } from "./emitter";
import { fail, failFromThrown, ok, thrownKind } from "./results";
import { checkoutUrlFor, isAllowedCheckoutUrl, parseAllowedHosts, toPublicAttempt } from "./public";

const IN_FLIGHT: readonly PaymentAttemptStatus[] = ["initiating", "awaiting_authentication", "processing", "verifying"];

function parseKoboSetting(value: string | null): number | null {
  if (value === null || !/^\d{1,15}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Same key must mean the same request. The repository checks this too, this is the second line of defence. */
function sameRequest(existing: PaymentAttemptV11, memberId: Uuid, input: InitiatePaymentInput): boolean {
  return (
    existing.memberId === memberId &&
    existing.purpose === input.purpose &&
    existing.amountKobo === input.amountKobo &&
    existing.obligationId === (input.obligationId ?? null) &&
    existing.channel === (input.channel ?? null)
  );
}

export function createInitiate(deps: PaymentServiceDeps) {
  const { repos, provider, log } = deps;
  const emit = createEmitter(deps);

  async function initiateInner(ctx: RequestContext, rawInput: InitiatePaymentInput): Promise<Result<InitiatePaymentOutput>> {
    const session = await deps.authz.requirePermission(ctx, "member.payment.create");
    if (!session.ok) return session;
    const memberId = session.value.memberId;

    const limited = await deps.rateLimiter.check(ctx, PAYMENT_INITIATE_RULE, { memberId });
    if (!limited.ok) return limited;

    const parsed = initiatePaymentInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".") || "_";
        if (!(key in fields)) fields[key] = issue.message;
      }
      return fail("VALIDATION_FAILED", ctx.requestId, fields);
    }
    const input: InitiatePaymentInput = parsed.data;

    // Not built until M4 or until the owner decides (Q6). Said plainly, never faked.
    if (input.paymentMethodId !== undefined) {
      return fail("VALIDATION_FAILED", ctx.requestId, { paymentMethodId: "Paying with a saved card is not available yet." });
    }
    if (input.channel === "manual_transfer") {
      return fail("VALIDATION_FAILED", ctx.requestId, { channel: "This payment method is not available." });
    }
    if (input.purpose === "scheduled_contribution" && input.obligationId === undefined) {
      return fail("VALIDATION_FAILED", ctx.requestId, { obligationId: "A scheduled contribution needs the contribution it pays." });
    }
    if (input.purpose === "card_authorization" && input.obligationId !== undefined) {
      return fail("VALIDATION_FAILED", ctx.requestId, { obligationId: "Adding a card cannot pay a scheduled contribution." });
    }

    const member = await repos.members.getById(memberId);
    if (member === null) return fail("AUTH_SESSION_EXPIRED", ctx.requestId);
    if (member.status === "pending_verification") return fail("AUTH_EMAIL_NOT_VERIFIED", ctx.requestId);
    if (member.status !== "active") return fail("AUTH_ACCOUNT_SUSPENDED", ctx.requestId);

    // Fail closed: a missing or unreadable limit blocks the payment. There is no fallback guess.
    let minKobo: number | null;
    let maxKobo: number | null;
    let allowedHosts: readonly string[];
    try {
      minKobo = parseKoboSetting(await repos.settings.get(SETTING_MIN_KOBO));
      maxKobo = parseKoboSetting(await repos.settings.get(SETTING_MAX_KOBO));
      allowedHosts = parseAllowedHosts(await repos.settings.get(SETTING_ALLOWED_CHECKOUT_HOSTS));
    } catch (err) {
      log.warn("initiate.settings_unavailable", { kind: thrownKind(err) });
      return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
    }
    if (minKobo === null || maxKobo === null || minKobo > maxKobo) {
      log.error("initiate.limits_not_configured", {});
      return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
    }
    if (input.amountKobo < minKobo || input.amountKobo > maxKobo) return fail("CONTRIBUTION_OUT_OF_RANGE", ctx.requestId);

    let obligation: ContributionObligation | null = null;
    if (input.obligationId !== undefined) {
      obligation = await repos.obligations.getById(input.obligationId);
      // Missing and someone else's look the same, so ids of other members cannot be probed.
      if (obligation === null || obligation.memberId !== memberId) return fail("NOT_FOUND", ctx.requestId);
      if (obligation.status !== "due" && obligation.status !== "scheduled") {
        return fail("VALIDATION_FAILED", ctx.requestId, { obligationId: "This contribution cannot be paid right now." });
      }
      if (obligation.amountKobo !== input.amountKobo) {
        return fail("VALIDATION_FAILED", ctx.requestId, { amountKobo: "The amount must match the contribution due." });
      }
      // A different key for an obligation that already has a payment in flight would be a second payment for the same thing.
      const others = await repos.attempts.listByObligation(obligation.id);
      const busy = others.some((a) => a.idempotencyKey !== input.idempotencyKey && IN_FLIGHT.includes(a.status));
      if (busy) return fail("PAYMENT_DUPLICATE_IN_PROGRESS", ctx.requestId);
    }

    const created = await repos.attempts.createIdempotent({
      memberId,
      purpose: input.purpose,
      channel: input.channel ?? null,
      amountKobo: input.amountKobo,
      reference: generateReference(deps.randomBytes),
      idempotencyKey: input.idempotencyKey,
      obligationId: obligation?.id ?? null,
      paymentMethodId: null,
    });
    const attempt = created.attempt;

    if (!created.created) {
      if (!sameRequest(attempt, memberId, input)) return fail("IDEMPOTENCY_KEY_REUSED", ctx.requestId);
      // A repeated tap. Never call the provider again for this reference.
      if (attempt.status === "initiating") return fail("PAYMENT_DUPLICATE_IN_PROGRESS", ctx.requestId);
      const url = attempt.status === "awaiting_authentication" ? checkoutUrlFor(attempt.providerAccessCode, allowedHosts[0]) : null;
      return ok({ attempt: toPublicAttempt(attempt), authorizationUrl: url !== null && isAllowedCheckoutUrl(url, allowedHosts) ? url : null });
    }

    const init = await provider.initialize({
      reference: attempt.reference,
      email: member.email,
      amountKobo: attempt.amountKobo,
      currency: attempt.currency,
      callbackUrl: `${deps.appUrl.replace(/\/+$/, "")}/app/pay/return`,
      metadata: { attempt_id: attempt.id, purpose: attempt.purpose },
    });

    if (!init.ok) return onInitializeFailure(ctx, attempt, init.error);

    if (!isAllowedCheckoutUrl(init.value.authorizationUrl, allowedHosts)) {
      // The member is never sent to a host we did not approve. The provider transaction is simply never used.
      log.error("initiate.foreign_checkout_host", { attemptId: attempt.id });
      await failAttempt(ctx, attempt, "PAYMENT_PROVIDER_UNAVAILABLE");
      return fail("PAYMENT_PROVIDER_UNAVAILABLE", ctx.requestId);
    }

    const next = await repos.attempts.transition(attempt.id, "initiating", "awaiting_authentication", { providerAccessCode: init.value.accessCode });
    if (next === null) return fail("PAYMENT_DUPLICATE_IN_PROGRESS", ctx.requestId); // moved by someone else, for example expiry
    await emit.publish(ctx, "payment.status_changed", { attemptId: attempt.id, memberId, from: "initiating", to: "awaiting_authentication" });
    return ok({ attempt: toPublicAttempt(next), authorizationUrl: init.value.authorizationUrl });
  }

  async function failAttempt(ctx: RequestContext, attempt: PaymentAttemptV11, code: ErrorCode): Promise<void> {
    const failed = await repos.attempts.transition(attempt.id, "initiating", "failed", { failureCode: code });
    if (failed !== null) {
      await emit.publish(ctx, "payment.status_changed", { attemptId: attempt.id, memberId: attempt.memberId, from: "initiating", to: "failed" });
      await emit.publish(ctx, "payment.failed", { attemptId: attempt.id, memberId: attempt.memberId, failureCode: code });
    }
  }

  async function onInitializeFailure(ctx: RequestContext, attempt: PaymentAttemptV11, failure: ProviderFailure): Promise<Result<InitiatePaymentOutput>> {
    if (failure.definitelyNotProcessed) {
      await failAttempt(ctx, attempt, "PAYMENT_PROVIDER_UNAVAILABLE");
      log.error("initiate.provider_refused", { attemptId: attempt.id, kind: failure.kind });
      return fail("PAYMENT_PROVIDER_UNAVAILABLE", ctx.requestId);
    }
    // No answer we can trust. The attempt stays `initiating` and reconciliation settles it by reference.
    // No retry here, with this or a new reference.
    log.warn("initiate.provider_no_answer", { attemptId: attempt.id, kind: failure.kind });
    return fail(failure.kind === "unavailable" ? "PAYMENT_PROVIDER_UNAVAILABLE" : "PAYMENT_PROVIDER_TIMEOUT", ctx.requestId);
  }

  return async function initiate(ctx: RequestContext, input: InitiatePaymentInput): Promise<Result<InitiatePaymentOutput>> {
    try {
      return await initiateInner(ctx, input);
    } catch (err) {
      if (err instanceof AppError) return failFromThrown(err, ctx.requestId);
      log.error("initiate.unexpected", { kind: thrownKind(err) });
      return failFromThrown(err, ctx.requestId);
    }
  };
}
