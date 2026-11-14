import type { RateLimitRule, RateLimiter, PrivacyService } from "../../contracts/services";
import { fail, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { createKit, type KitDeps } from "../support/kit";
import { privacyCreateInputSchema } from "./schemas";

/** ASSUMED limit. Owner tunable. */
export const PRIVACY_REQUEST_RATE: RateLimitRule = { name: "privacy_request_create", limit: 3, windowSeconds: 86400 };

export interface PrivacyServiceDeps extends KitDeps {
  readonly rateLimiter: RateLimiter;
}

/**
 * Records a request. It does NOT carry out access, export, correction or deletion. What those do, and how fast,
 * is an owner and legal decision that is still open, so the screen must only promise that a person will review it.
 */
export function createPrivacyService(deps: PrivacyServiceDeps): PrivacyService {
  const kit = createKit(deps);

  return {
    createRequest(ctx, input) {
      return kit.guard(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.privacy.request");
        if (!scope.ok) {
          return scope;
        }
        const parsed = privacyCreateInputSchema.safeParse(input);
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
      return kit.guard(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.privacy.request");
        if (!scope.ok) {
          return scope;
        }
        return ok(await scope.reads.privacyRequests.listByMember(scope.memberId));
      });
    },
  };
}
