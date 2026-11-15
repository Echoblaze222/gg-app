import { AppError, type AppErrorShape, type Result } from "../../contracts/errors";
import type { DomainEventMap, DomainEventName, EventBus, EventEnvelope } from "../../contracts/events";
import type { PermissionName } from "../../contracts/permissions";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RequestContext } from "../../contracts/services";
import { failFrom } from "../notifications/result";

export interface KitDeps {
  readonly repositories: RepositoryProvider;
  readonly authorization: AuthorizationService;
  /** Optional. Without it no audit entry is written. */
  readonly audit?: AuditService;
  /** Optional. Without it no domain event is published. */
  readonly events?: EventBus;
  readonly now?: () => Date;
  readonly newEventId?: () => string;
  /** Called when publishing an event failed. The action itself already succeeded. */
  readonly onPublishError?: (error: unknown, reference: string) => void;
  /** Called for failures that are not known AppErrors, and for best effort steps that failed (audit, status sync). */
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

export type MemberScope =
  | { readonly ok: true; readonly memberId: string; readonly reads: Repositories }
  | { readonly ok: false; readonly error: AppErrorShape };

/**
 * Shared plumbing for the AI-5 services: error mapping, permission check, and best effort events and audit.
 *
 * Data access rule used by every service built on this kit:
 * - READ through `reads` (session repositories, so row level security applies).
 * - WRITE through `writes()` (server repositories) only after the service has checked permission and ownership,
 *   so a member can never forge fields such as fromStaff, ip or status by calling the database directly.
 */
export function createKit(deps: KitDeps) {
  const now = deps.now ?? (() => new Date());
  const newEventId = deps.newEventId ?? (() => globalThis.crypto.randomUUID());

  return {
    now,

    async guard<T>(ctx: RequestContext, run: () => Promise<Result<T>>): Promise<Result<T>> {
      try {
        return await run();
      } catch (error) {
        if (!(error instanceof AppError)) {
          deps.onUnexpectedError?.(error, ctx.requestId);
        }
        return failFrom(error, ctx.requestId);
      }
    },

    /** Permission first. The member id always comes from the verified session, never from the caller. */
    async memberScope(ctx: RequestContext, permission: PermissionName): Promise<MemberScope> {
      const session = await deps.authorization.requirePermission(ctx, permission);
      if (!session.ok) {
        return { ok: false, error: session.error };
      }
      const reads = await deps.repositories.forSession();
      return { ok: true, memberId: session.value.memberId, reads };
    },

    /** Extra check for sensitive actions. Returns the failure to hand back, or null when it passed. */
    async requireReauth(ctx: RequestContext, permission: PermissionName): Promise<AppErrorShape | null> {
      const session = await deps.authorization.requirePermission(ctx, permission, { requireReauth: true });
      return session.ok ? null : session.error;
    },

    writes(): Repositories {
      return deps.repositories.server();
    },

    async publish<N extends DomainEventName>(ctx: RequestContext, name: N, data: DomainEventMap[N]): Promise<void> {
      if (!deps.events) {
        return;
      }
      const envelope: EventEnvelope<N, DomainEventMap[N]> = {
        id: newEventId(),
        name,
        occurredAt: now().toISOString(),
        requestId: ctx.requestId,
        actorId: ctx.actorId,
        data,
      };
      try {
        await deps.events.publish(envelope);
      } catch (error) {
        deps.onPublishError?.(error, ctx.requestId);
      }
    },

    async audit(ctx: RequestContext, entry: Parameters<AuditService["record"]>[1]): Promise<void> {
      if (!deps.audit) {
        return;
      }
      try {
        await deps.audit.record(ctx, entry);
      } catch (error) {
        deps.onUnexpectedError?.(error, ctx.requestId);
      }
    },
  };
}

export type Kit = ReturnType<typeof createKit>;
