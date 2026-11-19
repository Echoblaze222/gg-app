import { AppError, type Result } from "../../contracts/errors";
import type { Announcement, Page, PageRequest, Uuid } from "../../contracts/entities";
import type { RepositoryProvider } from "../../contracts/repositories";
import { pageRequestSchema } from "../../contracts/schemas";
import type { AuditService, AuthorizationService, RequestContext } from "../../contracts/services";
import type { AnnouncementService } from "../../contracts/v1_1";
import { announcementLink, buildExcerpt, createAnnouncementInputSchema, publishAnnouncementInputSchema } from "./announcement-schemas";
import { fail, failFrom, ok } from "./result";
import { fieldsFromZod } from "./schemas";

/**
 * What the fan out needs that contracts v1.1.0 does not provide yet. Requested in
 * docs/handoffs/ai5-contract-request-announcements.md. Until AI-1 delivers the matching repository methods and
 * an adapter wires them, `fanout` stays undefined and `publish` refuses, so nothing is half published.
 */
export interface AnnouncementFanoutState {
  readonly announcement: Announcement;
  /** Where the last fan out stopped in the list of active members. Null before the first page. */
  readonly fanoutCursor: string | null;
  /** Set once every active member was reached. */
  readonly fanoutCompletedAt: string | null;
}

export interface AnnouncementFanoutPorts {
  getState(id: Uuid): Promise<AnnouncementFanoutState | null>;
  /** Compare and set: sets publishedAt only while it is null. Safe to call again. Returns the stored announcement. */
  ensurePublished(id: Uuid): Promise<Announcement>;
  /** The cursor to resume from. Called only after a whole page was delivered. */
  saveProgress(id: Uuid, cursor: string | null): Promise<void>;
  completeFanout(id: Uuid): Promise<void>;
  /** In app notification, unique on (announcementId, memberId). `created` is false when it already existed. */
  notifyIfAbsent(input: { announcementId: Uuid; memberId: Uuid; title: string; body: string; link: string }): Promise<{ created: boolean }>;
}

export interface AnnouncementServiceDeps {
  readonly repositories: RepositoryProvider;
  readonly authorization: AuthorizationService;
  readonly audit: AuditService;
  /** Optional on purpose. Without it `publish` fails closed with SYSTEM_UNAVAILABLE. */
  readonly fanout?: AnnouncementFanoutPorts;
  /** Members read per page. Default 100. */
  readonly batchSize?: number;
  /** Pages delivered in one call before stopping. A repeat call resumes. Default 500. */
  readonly maxBatchesPerCall?: number;
  /** Notifications written in parallel inside one page. Default 10. */
  readonly concurrency?: number;
  /** Called when delivery to one or more members failed, or the member list stopped making progress. */
  readonly onFanoutError?: (error: unknown, reference: string) => void;
  /** Called for failures that are not a known AppError, and for audit write failures. */
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES_PER_CALL = 500;
const DEFAULT_CONCURRENCY = 10;

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Announcements: create a draft, publish it to every active member as an in app notification, list published ones.
 * Publishing is resumable and idempotent per announcement and member, so a crash, a timeout or a double tap
 * never sends the same member two notifications.
 */
export function createAnnouncementService(deps: AnnouncementServiceDeps): AnnouncementService {
  const batchSize = positiveInteger(deps.batchSize, DEFAULT_BATCH_SIZE);
  const maxBatchesPerCall = positiveInteger(deps.maxBatchesPerCall, DEFAULT_MAX_BATCHES_PER_CALL);
  const concurrency = positiveInteger(deps.concurrency, DEFAULT_CONCURRENCY);

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

  /** The action already happened when this runs, so an audit outage is reported but never undoes or blocks it. */
  async function auditBestEffort(ctx: RequestContext, entry: Parameters<AuditService["record"]>[1]): Promise<void> {
    try {
      await deps.audit.record(ctx, entry);
    } catch (error) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
  }

  async function deliverPage(
    ports: AnnouncementFanoutPorts,
    announcement: Announcement,
    memberIds: readonly Uuid[],
  ): Promise<{ created: number; existing: number; failed: number; firstError: unknown }> {
    const title = announcement.title;
    const body = buildExcerpt(announcement.body);
    const link = announcementLink(announcement.id);
    let created = 0;
    let existing = 0;
    let failed = 0;
    let firstError: unknown = undefined;
    for (let start = 0; start < memberIds.length; start += concurrency) {
      const chunk = memberIds.slice(start, start + concurrency);
      const settled = await Promise.allSettled(
        chunk.map((memberId) => ports.notifyIfAbsent({ announcementId: announcement.id, memberId, title, body, link })),
      );
      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          if (outcome.value.created) {
            created += 1;
          } else {
            existing += 1;
          }
        } else {
          failed += 1;
          if (firstError === undefined) {
            firstError = outcome.reason;
          }
        }
      }
    }
    return { created, existing, failed, firstError };
  }

  return {
    create(ctx, input) {
      return guard<Announcement>(ctx, async () => {
        const session = await deps.authorization.requirePermission(ctx, "admin.announcements.manage");
        if (!session.ok) {
          return session;
        }
        const parsed = createAnnouncementInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        // The author always comes from the verified session, never from the caller.
        const announcement = await deps.repositories.server().announcements.create({
          title: parsed.data.title,
          body: parsed.data.body,
          createdBy: session.value.memberId,
        });
        await auditBestEffort(ctx, { action: "announcement.create", targetType: "announcement", targetId: announcement.id, result: "success" });
        return ok(announcement);
      });
    },

    publish(ctx, input) {
      return guard<Announcement>(ctx, async () => {
        // A message to every member is a phishing risk, so publishing asks for the password again.
        const session = await deps.authorization.requirePermission(ctx, "admin.announcements.manage", { requireReauth: true });
        if (!session.ok) {
          return session;
        }
        const parsed = publishAnnouncementInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const ports = deps.fanout;
        if (!ports) {
          deps.onUnexpectedError?.(new Error("Announcement fan out is not wired: repository support is missing."), ctx.requestId);
          return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
        }
        const { announcementId } = parsed.data;

        const state = await ports.getState(announcementId);
        if (!state) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        if (state.fanoutCompletedAt !== null) {
          return ok(state.announcement);
        }

        const announcement = await ports.ensurePublished(announcementId);
        const members = deps.repositories.server().members;
        let cursor = state.fanoutCursor;
        let created = 0;
        let existing = 0;

        for (let batch = 0; ; batch += 1) {
          if (batch >= maxBatchesPerCall) {
            // Progress is saved after every page, so calling publish again continues from here.
            return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
          }
          const request: PageRequest = { limit: batchSize, cursor };
          const page = await members.list({ status: "active" }, request);
          const delivered = await deliverPage(
            ports,
            announcement,
            page.items.map((member) => member.id),
          );
          if (delivered.failed > 0) {
            // The cursor is not advanced, so the next call retries this page. Existing rows are skipped by the unique key.
            deps.onFanoutError?.(delivered.firstError, ctx.requestId);
            return fail("SYSTEM_UNAVAILABLE", ctx.requestId);
          }
          created += delivered.created;
          existing += delivered.existing;

          if (page.nextCursor !== null && page.nextCursor === cursor) {
            deps.onFanoutError?.(new Error("Member list returned the same cursor twice."), ctx.requestId);
            return fail("INTERNAL", ctx.requestId);
          }
          cursor = page.nextCursor;
          await ports.saveProgress(announcementId, cursor);
          if (cursor === null) {
            break;
          }
        }

        await ports.completeFanout(announcementId);
        await auditBestEffort(ctx, {
          action: "announcement.publish",
          targetType: "announcement",
          targetId: announcementId,
          result: "success",
          detail: { created, alreadyDelivered: existing },
        });
        return ok(announcement);
      });
    },

    listPublished(ctx, page) {
      return guard<Page<Announcement>>(ctx, async () => {
        const session = await deps.authorization.requirePermission(ctx, "member.profile.read");
        if (!session.ok) {
          return session;
        }
        const parsed = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const request: PageRequest = { limit: parsed.data.limit, cursor: parsed.data.cursor ?? null };
        const repos = await deps.repositories.forSession();
        return ok(await repos.announcements.listPublished(request));
      });
    },
  };
}
