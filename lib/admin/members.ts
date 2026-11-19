import { AppError, type Result } from "../../contracts/errors";
import type { Member, Page, PageRequest, Uuid } from "../../contracts/entities";
import { PRIVILEGED_ROLES, type MemberStatus, type Role } from "../../contracts/enums";
import type { EventBus } from "../../contracts/events";
import type { RepositoryProvider } from "../../contracts/repositories";
import { pageRequestSchema } from "../../contracts/schemas";
import type { AuditService, AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { canTransition } from "../../contracts/state-machines";
import type { AdminMemberService } from "../../contracts/v1_1";
import { fail, failFrom, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { getMemberInputSchema, listMembersInputSchema, setMemberStatusInputSchema } from "./member-schemas";

/**
 * What staff may change. Not in the frozen contract yet, requested as M-2 in
 * docs/handoffs/ai5-contract-request-admin-members.md. Deliberately narrow:
 * - pending_verification becomes active only through email verification, so staff cannot skip it.
 * - closed is final and is set only by the approved deletion flow.
 */
export const ADMIN_MEMBER_STATUS_TRANSITIONS: Record<MemberStatus, readonly MemberStatus[]> = {
  pending_verification: [],
  active: ["suspended"],
  suspended: ["active"],
  closed: [],
};

export interface AdminMemberServiceDeps {
  readonly repositories: RepositoryProvider;
  readonly authorization: AuthorizationService;
  readonly audit: AuditService;
  readonly events?: EventBus;
  readonly now?: () => Date;
  readonly newEventId?: () => string;
  /**
   * Ends every session of the member. Called after a suspension. Optional because the repository has no
   * revoke all method yet (request M-3). Without it, AI-2's request check must reject suspended members.
   */
  readonly revokeAllSessions?: (memberId: Uuid) => Promise<void>;
  /** A failed session revocation after a suspension. Treat as an alert: the member is suspended but may still hold a session. */
  readonly onSessionRevokeError?: (error: unknown, reference: string) => void;
  readonly onPublishError?: (error: unknown, reference: string) => void;
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

type Refusal = "self" | "owner_protected" | "owner_only";

/** Who may change whom. Checked before any write. */
function refusalFor(actor: SessionInfo, target: Member): Refusal | null {
  if (target.id === actor.memberId) {
    return "self";
  }
  if (target.roles.includes("owner")) {
    return "owner_protected";
  }
  const targetIsStaff = target.roles.some((role) => (PRIVILEGED_ROLES as readonly Role[]).includes(role));
  if (targetIsStaff && !actor.roles.includes("owner")) {
    return "owner_only";
  }
  return null;
}

/** Staff directory: list, view and suspend or reactivate members. Every sensitive step is permission checked and audited. */
export function createAdminMemberService(deps: AdminMemberServiceDeps): AdminMemberService {
  const now = deps.now ?? (() => new Date());
  const newEventId = deps.newEventId ?? (() => crypto.randomUUID());

  async function guard<T>(ctx: RequestContext, run: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof AppError)) {
        deps.onUnexpectedError?.(error, ctx.requestId);
      }
      return failFrom(error, ctx.requestId);
    }
  }

  /** Used after the action happened or was refused, so an audit outage is reported but never changes the outcome. */
  async function auditBestEffort(ctx: RequestContext, entry: Parameters<AuditService["record"]>[1]): Promise<void> {
    try {
      await deps.audit.record(ctx, entry);
    } catch (error) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
  }

  return {
    list(ctx, input, page) {
      return guard<Page<Member>>(ctx, async () => {
        const session = await deps.authorization.requirePermission(ctx, "admin.members.read");
        if (!session.ok) {
          return session;
        }
        const parsedInput = listMembersInputSchema.safeParse(input);
        if (!parsedInput.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsedInput.error));
        }
        const parsedPage = pageRequestSchema.safeParse(page);
        if (!parsedPage.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsedPage.error));
        }
        const filter: { status?: MemberStatus; search?: string } = {};
        if (parsedInput.data.status !== undefined) {
          filter.status = parsedInput.data.status;
        }
        if (parsedInput.data.search !== undefined && parsedInput.data.search !== "") {
          filter.search = parsedInput.data.search;
        }
        const request: PageRequest = { limit: parsedPage.data.limit, cursor: parsedPage.data.cursor ?? null };
        return ok(await deps.repositories.server().members.list(filter, request));
      });
    },

    get(ctx, input) {
      return guard<Member>(ctx, async () => {
        const session = await deps.authorization.requirePermission(ctx, "admin.members.read");
        if (!session.ok) {
          return session;
        }
        const parsed = getMemberInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const member = await deps.repositories.server().members.getById(parsed.data.memberId);
        if (!member) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        // Opening one member shows personal data, so it is recorded. The list is not, it would drown the log.
        await auditBestEffort(ctx, { action: "admin.member.view", targetType: "member", targetId: member.id, result: "success" });
        return ok(member);
      });
    },

    setStatus(ctx, input) {
      return guard<Member>(ctx, async () => {
        const session = await deps.authorization.requirePermission(ctx, "admin.members.suspend", { requireReauth: true });
        if (!session.ok) {
          return session;
        }
        const parsed = setMemberStatusInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const { memberId, status: to, reason } = parsed.data;
        const members = deps.repositories.server().members;
        const current = await members.getById(memberId);
        if (!current) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        const from = current.status;

        const refused = refusalFor(session.value, current);
        if (refused !== null) {
          await auditBestEffort(ctx, {
            action: "admin.member.set_status",
            targetType: "member",
            targetId: memberId,
            result: "denied",
            detail: { refusal: refused, from, to },
          });
          return fail("PERMISSION_DENIED", ctx.requestId);
        }

        // Asking for the status the member already has changes nothing and is not an error.
        if (from === to) {
          return ok(current);
        }
        if (!canTransition(ADMIN_MEMBER_STATUS_TRANSITIONS, from, to)) {
          await auditBestEffort(ctx, {
            action: "admin.member.set_status",
            targetType: "member",
            targetId: memberId,
            result: "denied",
            detail: { refusal: "transition_not_allowed", from, to },
          });
          return fail("VALIDATION_FAILED", ctx.requestId, { status: "This status change is not allowed." });
        }

        const updated = await members.setStatus(memberId, to);
        await auditBestEffort(ctx, {
          action: "admin.member.set_status",
          targetType: "member",
          targetId: memberId,
          result: "success",
          detail: { from, to, reason },
        });

        if (deps.events) {
          try {
            await deps.events.publish({
              id: newEventId(),
              name: "member.status_changed",
              occurredAt: now().toISOString(),
              requestId: ctx.requestId,
              actorId: ctx.actorId,
              data: { memberId, from, to },
            });
          } catch (error) {
            deps.onPublishError?.(error, ctx.requestId);
          }
        }

        if (to === "suspended" && deps.revokeAllSessions) {
          try {
            await deps.revokeAllSessions(memberId);
          } catch (error) {
            deps.onSessionRevokeError?.(error, ctx.requestId);
          }
        }
        return ok(updated);
      });
    },
  };
}
