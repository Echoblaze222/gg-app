/**
 * M3 payment module: the member facing PaymentService methods built so far, plus the settler and webhook service
 * that webhooks and reconciliation share. Refunds, saved method listing and removal arrive in M4 and M5, so the
 * type says exactly what exists instead of pretending to be the whole PaymentService.
 */
import type { PaymentAttempt } from "@/contracts/entities";
import type { Result } from "@/contracts/errors";
import type { PaymentService, RequestContext } from "@/contracts/services";
import { isValidReference } from "../reference";
import { PAYMENT_VERIFY_RULE, type PaymentServiceDeps } from "./deps";
import { createInitiate } from "./initiate";
import { fail, failFromThrown, ok, thrownKind } from "./results";
import { toPublicAttempt } from "./public";
import { createSettler, type Settler } from "./settle";
import { createWebhookService, type WebhookService } from "./webhook";

export type PaymentServiceM3 = Pick<PaymentService, "initiate" | "verifyAndSettle" | "getAttempt" | "listHistory">;

export interface PaymentModule {
  payments: PaymentServiceM3;
  webhooks: WebhookService;
  settler: Settler;
}

export function createPaymentModule(deps: PaymentServiceDeps): PaymentModule {
  const settler = createSettler(deps);
  const webhooks = createWebhookService(deps, settler);
  const initiate = createInitiate(deps);

  const payments: PaymentServiceM3 = {
    initiate,

    async verifyAndSettle(ctx: RequestContext, input: { reference: string }): Promise<Result<PaymentAttempt>> {
      try {
        const session = await deps.authz.requirePermission(ctx, "member.payment.create");
        if (!session.ok) return session;
        const limited = await deps.rateLimiter.check(ctx, PAYMENT_VERIFY_RULE, { memberId: session.value.memberId });
        if (!limited.ok) return limited;

        // Malformed, unknown and someone else's all look the same.
        if (!isValidReference(input.reference)) return fail("NOT_FOUND", ctx.requestId);
        const attempt = await deps.repos.attempts.getByReference(input.reference);
        if (attempt === null || attempt.memberId !== session.value.memberId) return fail("NOT_FOUND", ctx.requestId);

        const settled = await settler.settleAttempt(ctx, attempt);
        return settled.ok ? ok(toPublicAttempt(settled.value)) : settled;
      } catch (err) {
        deps.log.error("verify.unexpected", { kind: thrownKind(err) });
        return failFromThrown(err, ctx.requestId);
      }
    },

    async getAttempt(ctx, input) {
      try {
        const session = await deps.authz.requirePermission(ctx, "member.history.read");
        if (!session.ok) return session;
        const attempt = await deps.repos.attempts.getById(input.attemptId);
        if (attempt === null || attempt.memberId !== session.value.memberId) return fail("NOT_FOUND", ctx.requestId);
        return ok(toPublicAttempt(attempt));
      } catch (err) {
        deps.log.error("get_attempt.unexpected", { kind: thrownKind(err) });
        return failFromThrown(err, ctx.requestId);
      }
    },

    async listHistory(ctx, page) {
      try {
        const session = await deps.authz.requirePermission(ctx, "member.history.read");
        if (!session.ok) return session;
        const limit = Number.isInteger(page.limit) ? Math.min(Math.max(page.limit, 1), 100) : 25;
        const result = await deps.repos.attempts.listByMember(session.value.memberId, { limit, cursor: page.cursor ?? null });
        return ok({ items: result.items.map(toPublicAttempt), nextCursor: result.nextCursor });
      } catch (err) {
        deps.log.error("list_history.unexpected", { kind: thrownKind(err) });
        return failFromThrown(err, ctx.requestId);
      }
    },
  };

  return { payments, webhooks, settler };
}

export type { PaymentServiceDeps, PaymentRepos, OpsLog } from "./deps";
export type { WebhookService, WebhookOutcome } from "./webhook";
export type { Settler } from "./settle";
