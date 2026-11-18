import type { PayoutRequest, PrivacyRequest, Uuid } from "../../contracts/entities";
import { OPEN_PAYOUT_STATUSES, type PayoutStatus } from "../../contracts/enums";
import type { Repositories } from "../../contracts/repositories";
import { pageRequestSchema, privacyRequestInputSchema } from "../../contracts/schemas";
import type { RateLimitRule, RateLimiter, RequestContext } from "../../contracts/services";
import type { PrivacyServiceV11 } from "../../contracts/v1_1";
import { fail, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { createKit, type KitDeps } from "../support/kit";
import { privacyRepo } from "../support/v11";
import { privacyDecideInputSchema } from "./schemas";

/** ASSUMED limit. Owner tunable. */
export const PRIVACY_REQUEST_RATE: RateLimitRule = { name: "privacy_request_create", limit: 3, windowSeconds: 86400 };

/** Scan of a member's payouts for an open one. Bounded and fails closed. */
export const PAYOUT_SCAN_PAGE_SIZE = 100;
export const PAYOUT_SCAN_MAX_PAGES = 5;

/**
 * The parts of account deletion that no repository in the contract can do yet: finding open refunds for a member,
 * and anonymizing the identity. See docs/handoffs/ai5-contract-request-v11-followups.md.
 * Without an executor, approving a deletion request is refused. It never half completes.
 */
export interface DeletionExecutor {
  hasOpenRefund(memberId: Uuid): Promise<boolean>;
  /**
   * Anonymizes name, phone and email, and revokes sessions and saved payment methods. Ledger rows stay (ADR-003).
   * MUST be idempotent: it runs again if a later step fails.
   */
  anonymize(ctx: RequestContext, memberId: Uuid): Promise<void>;
}

export interface PrivacyServiceDeps extends KitDeps {
  readonly rateLimiter: RateLimiter;
  readonly deletion?: DeletionExecutor;
}

async function hasOpenPayout(repos: Repositories, memberId: Uuid): Promise<boolean> {
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < PAYOUT_SCAN_MAX_PAGES; pageNumber += 1) {
    const page: { items: PayoutRequest[]; nextCursor: string | null } = await repos.payouts.listByMember(memberId, { limit: PAYOUT_SCAN_PAGE_SIZE, cursor });
    if (page.items.some((payout) => (OPEN_PAYOUT_STATUSES as readonly PayoutStatus[]).includes(payout.status))) {
      return true;
    }
    if (page.nextCursor === null) {
      return false;
    }
    cursor = page.nextCursor;
  }
  // Fail closed: if the scan ran out of pages, assume there is an open payout.
  return true;
}

/**
 * Records requests and, for staff, decides them.
 * Creating a request does NOT carry out access, export, correction or deletion. What those do, and how fast, is an
 * owner and legal decision that is still open, so a screen must only promise that a person will review it.
 */
export function createPrivacyService(deps: PrivacyServiceDeps): PrivacyServiceV11 {
  const kit = createKit(deps);

  /** Interim rule from docs/handoffs/integrator-decisions-001.md. OPEN for owner and legal confirmation. */
  async function deletionBlockers(writes: Repositories, executor: DeletionExecutor, memberId: Uuid): Promise<string[]> {
    const reasons: string[] = [];
    const balance = await writes.ledger.getBalance(memberId);
    if (balance.ledgerKobo !== 0 || balance.heldKobo !== 0) {
      reasons.push("The member still has a balance.");
    }
    if (await hasOpenPayout(writes, memberId)) {
      reasons.push("The member has a withdrawal in progress.");
    }
    if (await executor.hasOpenRefund(memberId)) {
      reasons.push("The member has a refund in progress.");
    }
    return reasons;
  }

  return {
    createRequest(ctx, input) {
      return kit.guard<PrivacyRequest>(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.privacy.request");
        if (!scope.ok) {
          return scope;
        }
        const parsed = privacyRequestInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const { kind } = parsed.data;

        // Deleting an account is the most serious request, so the password is confirmed again first.
        if (kind === "deletion") {
          const reauthError = await kit.requireReauth(ctx, "member.privacy.request");
          if (reauthError !== null) {
            return { ok: false, error: reauthError };
          }
        }

        // An open request of the same kind is returned instead of creating a duplicate, and uses no rate limit.
        const mine = await scope.reads.privacyRequests.listByMember(scope.memberId);
        const open = mine.find((request) => request.kind === kind && (request.status === "received" || request.status === "in_review"));
        if (open) {
          return ok(open);
        }

        const limit = await deps.rateLimiter.check(ctx, PRIVACY_REQUEST_RATE, { memberId: scope.memberId });
        if (!limit.ok) {
          return { ok: false, error: limit.error };
        }

        const created = await kit.writes().privacyRequests.create({ memberId: scope.memberId, kind });
        await kit.audit(ctx, { action: "privacy.request.create", targetType: "privacy_request", targetId: created.id, result: "success", detail: { kind } });
        await kit.publish(ctx, "privacy.request_created", { requestId: created.id, memberId: scope.memberId, kind });
        return ok(created);
      });
    },

    listMine(ctx) {
      return kit.guard<PrivacyRequest[]>(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.privacy.request");
        if (!scope.ok) {
          return scope;
        }
        return ok(await scope.reads.privacyRequests.listByMember(scope.memberId));
      });
    },

    listOpen(ctx, page) {
      return kit.guard(ctx, async () => {
        const auth = await kit.authorize(ctx, "admin.privacy.manage");
        if (!auth.ok) {
          return { ok: false as const, error: auth.error };
        }
        const parsed = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        return ok(await kit.writes().privacyRequests.listOpen({ limit: parsed.data.limit, cursor: parsed.data.cursor ?? null }));
      });
    },

    decide(ctx, input) {
      return kit.guard<PrivacyRequest>(ctx, async () => {
        const auth = await kit.authorize(ctx, "admin.privacy.manage");
        if (!auth.ok) {
          return { ok: false, error: auth.error };
        }
        const actorId = auth.value.memberId;
        const parsed = privacyDecideInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const { requestId, approve, note } = parsed.data;
        if (!approve && (note === undefined || note.length < 3)) {
          return fail("VALIDATION_FAILED", ctx.requestId, { note: "Say why the request is rejected." });
        }

        const writes = kit.writes();
        const repo = privacyRepo(writes);
        const request = await repo.getById(requestId);
        if (request === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        // Nobody decides a request about their own account.
        if (request.memberId === actorId) {
          return fail("PERMISSION_DENIED", ctx.requestId);
        }
        if (request.status !== "received" && request.status !== "in_review") {
          return fail("CONFLICT", ctx.requestId, { requestId: "This request was already decided." });
        }

        const approvesDeletion = approve && request.kind === "deletion";
        // Approving a deletion cannot be undone, so the password is confirmed again before anything changes.
        if (approvesDeletion) {
          const reauthError = await kit.requireReauth(ctx, "admin.privacy.manage");
          if (reauthError !== null) {
            return { ok: false, error: reauthError };
          }
        }

        const changedByOthers = fail("CONFLICT", ctx.requestId, { requestId: "This request was changed by someone else. Refresh and try again." });
        let current = request;
        if (current.status === "received") {
          const moved = await repo.setStatus(current.id, "received", "in_review", actorId);
          if (moved === null) {
            return changedByOthers;
          }
          current = moved;
        }

        const detail = { kind: current.kind, approve, ...(note !== undefined ? { note } : {}) };

        if (!approve) {
          const rejected = await repo.setStatus(current.id, "in_review", "rejected", actorId);
          if (rejected === null) {
            return changedByOthers;
          }
          await kit.audit(ctx, { action: "privacy.request.decide", targetType: "privacy_request", targetId: current.id, result: "success", detail });
          return ok(rejected);
        }

        if (current.kind === "deletion") {
          const executor = deps.deletion;
          if (!executor) {
            await kit.audit(ctx, { action: "privacy.request.decide", targetType: "privacy_request", targetId: current.id, result: "failure", detail: { ...detail, reason: "deletion_not_configured" } });
            return fail("CONFLICT", ctx.requestId, { requestId: "Deletion cannot be carried out yet because account anonymization is not set up. The request stays in review." });
          }
          const blockers = await deletionBlockers(writes, executor, current.memberId);
          if (blockers.length > 0) {
            await kit.audit(ctx, { action: "privacy.request.decide", targetType: "privacy_request", targetId: current.id, result: "denied", detail: { ...detail, blockers } });
            return fail("CONFLICT", ctx.requestId, { requestId: `${blockers.join(" ")} The request stays in review.` });
          }
          // Irreversible, and safe to repeat. If the status step below fails, deciding again anonymizes again, then completes.
          await executor.anonymize(ctx, current.memberId);
        }

        const completed = await repo.setStatus(current.id, "in_review", "completed", actorId);
        if (completed === null) {
          deps.onUnexpectedError?.(new Error("Request status could not be completed after the decision work was done."), ctx.requestId);
          await kit.audit(ctx, { action: "privacy.request.decide", targetType: "privacy_request", targetId: current.id, result: "failure", detail: { ...detail, reason: "status_not_completed" } });
          return fail("CONFLICT", ctx.requestId, { requestId: "The work was done but the request status could not be updated. Decide again to finish." });
        }
        await kit.audit(ctx, { action: "privacy.request.decide", targetType: "privacy_request", targetId: current.id, result: "success", detail });
        return ok(completed);
      });
    },
  };
}
