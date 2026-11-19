import { AppError, type Result } from "../../contracts/errors";
import type { Notification, Page, PageRequest, Uuid } from "../../contracts/entities";
import type { EventBus } from "../../contracts/events";
import type { RepositoryProvider } from "../../contracts/repositories";
import { pageRequestSchema } from "../../contracts/schemas";
import type { AuthorizationService, NotificationService, RequestContext } from "../../contracts/services";
import { fail, failFrom, ok } from "./result";
import { fieldsFromZod, markReadInputSchema, notifyInputSchema } from "./schemas";

export interface NotificationServiceDeps {
  readonly repositories: RepositoryProvider;
  readonly authorization: AuthorizationService;
  /** Optional. Without it no domain event is published. */
  readonly events?: EventBus;
  readonly now?: () => Date;
  readonly newEventId?: () => string;
  /** Called when publishing the event failed. The notification itself is already stored. */
  readonly onPublishError?: (error: unknown, reference: string) => void;
  /** Called for any failure that is not a known AppError, so it can be logged with the reference. */
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

/**
 * In app notifications only. Email and SMS are not implemented because no provider contract exists yet.
 * `notify` is a server side entry point for other services and must never be exposed to the browser.
 */
export function createNotificationService(deps: NotificationServiceDeps): NotificationService {
  const now = deps.now ?? (() => new Date());
  const newEventId = deps.newEventId ?? (() => globalThis.crypto.randomUUID());

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

  /** Permission check first. The member id always comes from the verified session, never from the caller. */
  async function memberScope(ctx: RequestContext) {
    const session = await deps.authorization.requirePermission(ctx, "member.profile.read");
    if (!session.ok) {
      return { ok: false as const, error: session.error };
    }
    const repos = await deps.repositories.forSession();
    return { ok: true as const, memberId: session.value.memberId, repos };
  }

  return {
    notify(ctx, input) {
      return guard<Notification>(ctx, async () => {
        const parsed = notifyInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const { memberId, type, title, body, link } = parsed.data;
        const notification = await deps.repositories.server().notifications.create({
          memberId,
          type,
          channel: "in_app",
          title,
          body,
          link: link ?? null,
        });
        if (deps.events) {
          try {
            await deps.events.publish({
              id: newEventId(),
              name: "notification.created",
              occurredAt: now().toISOString(),
              requestId: ctx.requestId,
              actorId: ctx.actorId,
              data: { notificationId: notification.id, memberId },
            });
          } catch (error) {
            deps.onPublishError?.(error, ctx.requestId);
          }
        }
        return ok(notification);
      });
    },

    list(ctx, page) {
      return guard<Page<Notification>>(ctx, async () => {
        const scope = await memberScope(ctx);
        if (!scope.ok) {
          return scope;
        }
        const parsed = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const request: PageRequest = { limit: parsed.data.limit, cursor: parsed.data.cursor ?? null };
        return ok(await scope.repos.notifications.listByMember(scope.memberId, request));
      });
    },

    unreadCount(ctx) {
      return guard<number>(ctx, async () => {
        const scope = await memberScope(ctx);
        if (!scope.ok) {
          return scope;
        }
        return ok(await scope.repos.notifications.unreadCount(scope.memberId));
      });
    },

    markRead(ctx, input) {
      return guard<void>(ctx, async () => {
        const scope = await memberScope(ctx);
        if (!scope.ok) {
          return scope;
        }
        const parsed = markReadInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const ids: Uuid[] = [...new Set(parsed.data.ids)];
        await scope.repos.notifications.markRead(scope.memberId, ids);
        return ok(undefined);
      });
    },

    markAllRead(ctx) {
      return guard<void>(ctx, async () => {
        const scope = await memberScope(ctx);
        if (!scope.ok) {
          return scope;
        }
        await scope.repos.notifications.markAllRead(scope.memberId);
        return ok(undefined);
      });
    },
  };
}
