import type { PolicyVersion } from "../../contracts/entities";
import { POLICY_KINDS } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import { policyKindSchema } from "../../contracts/schemas";
import type { PolicyService } from "../../contracts/services";
import { fail, failFrom, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { createKit, type KitDeps } from "../support/kit";
import { policyAcceptInputSchema } from "./schemas";

export interface PolicyServiceDeps extends KitDeps {
  /** Reference for failures of calls that carry no request context (public policy reads). */
  readonly newReference?: () => string;
}

/** A version counts only when it has a valid publish time that is not in the future. */
export function publishedVersions(versions: readonly PolicyVersion[], nowMs: number): PolicyVersion[] {
  return versions.filter((version) => {
    if (version.publishedAt === null) {
      return false;
    }
    const time = Date.parse(version.publishedAt);
    return Number.isFinite(time) && time <= nowMs;
  });
}

/** Newest published version. On equal publish times the later entry in the list wins. */
export function latestPublished(versions: readonly PolicyVersion[], nowMs: number): PolicyVersion | null {
  let best: PolicyVersion | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const version of publishedVersions(versions, nowMs)) {
    const time = Date.parse(version.publishedAt as string);
    if (time >= bestTime) {
      best = version;
      bestTime = time;
    }
  }
  return best;
}

export function createPolicyService(deps: PolicyServiceDeps): PolicyService {
  const kit = createKit(deps);
  const newReference = deps.newReference ?? (() => globalThis.crypto.randomUUID());

  return {
    /** Public. The draft flag is returned as is, so legal pages can show the needs legal review marker. */
    async getCurrent(kind) {
      const reference = newReference();
      try {
        const parsedKind = policyKindSchema.safeParse(kind);
        if (!parsedKind.success) {
          return fail("VALIDATION_FAILED", reference, { kind: "Unknown policy." });
        }
        const versions = await kit.writes().policies.listVersions(parsedKind.data);
        const current = latestPublished(versions, kit.now().getTime());
        return current === null ? fail("NOT_FOUND", reference) : ok(current);
      } catch (error) {
        if (!(error instanceof AppError)) {
          deps.onUnexpectedError?.(error, reference);
        }
        return failFrom(error, reference);
      }
    },

    accept(ctx, input) {
      return kit.guard(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.profile.update");
        if (!scope.ok) {
          return scope;
        }
        const parsed = policyAcceptInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const wantedId = parsed.data.policyVersionId;
        const nowMs = kit.now().getTime();
        const writes = kit.writes();

        // No getById exists, so find the version among the published versions of every kind.
        const lists = await Promise.all(POLICY_KINDS.map((kind) => writes.policies.listVersions(kind)));
        let target: { version: PolicyVersion; latest: PolicyVersion | null } | null = null;
        for (const versions of lists) {
          const hit = publishedVersions(versions, nowMs).find((version) => version.id === wantedId);
          if (hit) {
            target = { version: hit, latest: latestPublished(versions, nowMs) };
            break;
          }
        }
        // Unknown ids and unpublished drafts look the same.
        if (target === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        // Consent is only recorded for the text that is current now, never for an older version from a stale page.
        if (target.latest === null || target.latest.id !== target.version.id) {
          return fail("CONFLICT", ctx.requestId, { policyVersionId: "A newer version of this policy is available. Reload and read it before accepting." });
        }

        // Accepting twice is a no-op that returns the first acceptance, so the evidence is never duplicated.
        const existing = (await scope.reads.policies.listAcceptances(scope.memberId)).find((acceptance) => acceptance.policyVersionId === wantedId);
        if (existing) {
          return ok(existing);
        }

        // Written with the server repository so the ip comes from the server and cannot be supplied by the member.
        const acceptance = await writes.policies.accept({ memberId: scope.memberId, policyVersionId: wantedId, ip: ctx.ip });
        await kit.audit(ctx, { action: "policy.accept", targetType: "policy_version", targetId: wantedId, result: "success", detail: { kind: target.version.kind, version: target.version.version, draft: target.version.draft } });
        await kit.publish(ctx, "policy.accepted", { memberId: scope.memberId, policyVersionId: wantedId });
        return ok(acceptance);
      });
    },

    listAcceptances(ctx) {
      return kit.guard(ctx, async (): Promise<Result<Awaited<ReturnType<PolicyService["listAcceptances"]>> extends Result<infer T> ? T : never>> => {
        const scope = await kit.memberScope(ctx, "member.profile.read");
        if (!scope.ok) {
          return scope;
        }
        return ok(await scope.reads.policies.listAcceptances(scope.memberId));
      });
    },
  };
}
