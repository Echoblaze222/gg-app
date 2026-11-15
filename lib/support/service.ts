import type { Page, SupportMessage, SupportTicket, Uuid } from "../../contracts/entities";
import { PRIVILEGED_ROLES, type Role } from "../../contracts/enums";
import type { AppErrorShape } from "../../contracts/errors";
import type { Repositories } from "../../contracts/repositories";
import { pageRequestSchema } from "../../contracts/schemas";
import type { NotificationService, RateLimitRule, RateLimiter, RequestContext } from "../../contracts/services";
import type { SupportServiceV11 } from "../../contracts/v1_1";
import { fail, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { createKit, type KitDeps } from "./kit";
import { listAcrossStatuses } from "./staff-cursor";
import { listForStaffInputSchema, replyInputSchema, setStatusInputSchema, ticketIdInputSchema, ticketInputSchema } from "./schemas";
import { supportRepo } from "./v11";

/** ASSUMED limits. Owner tunable. They stop floods, not normal use. */
export const SUPPORT_TICKET_RATE: RateLimitRule = { name: "support_ticket_create", limit: 5, windowSeconds: 3600 };
export const SUPPORT_REPLY_RATE: RateLimitRule = { name: "support_reply", limit: 30, windowSeconds: 3600 };

/** Member side ownership check without getById on the v1.0.0 repository. Bounded, fails closed. */
export const TICKET_SCAN_PAGE_SIZE = 100;
export const TICKET_SCAN_MAX_PAGES = 5;

export interface SupportServiceDeps extends KitDeps {
  readonly rateLimiter: RateLimiter;
  /** Optional. Lets a staff reply tell the member through an in app notification. Best effort. */
  readonly notifications?: Pick<NotificationService, "notify">;
}

async function findOwnTicket(reads: Repositories, memberId: Uuid, ticketId: Uuid): Promise<SupportTicket | null> {
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < TICKET_SCAN_MAX_PAGES; pageNumber += 1) {
    const page: Page<SupportTicket> = await reads.support.listByMember(memberId, { limit: TICKET_SCAN_PAGE_SIZE, cursor });
    const hit = page.items.find((ticket) => ticket.id === ticketId);
    if (hit) {
      return hit;
    }
    if (page.nextCursor === null) {
      return null;
    }
    cursor = page.nextCursor;
  }
  // Fail closed: a ticket we could not find is treated as not the member's.
  return null;
}

type SupportAccess =
  | { readonly ok: false; readonly error: AppErrorShape }
  | { readonly ok: true; readonly mode: "member" | "staff"; readonly actorId: Uuid; readonly reads: Repositories };

const isPrivileged = (roles: readonly Role[]) => roles.some((role) => (PRIVILEGED_ROLES as readonly Role[]).includes(role));

export function createSupportService(deps: SupportServiceDeps): SupportServiceV11 {
  const kit = createKit(deps);

  /**
   * getTicket and listMessages serve both the member screen and the staff screen.
   * - Member permission first, so ordinary members never trigger a permission denied record.
   * - A privileged role that also holds admin.support.read acts as staff. Everyone else acts as a member.
   * - A support only account has no member permission, so it falls through to the staff check.
   * - Anything other than PERMISSION_DENIED (for example an expired session) is returned as is, without a second call.
   */
  async function supportAccess(ctx: RequestContext): Promise<SupportAccess> {
    const asMember = await kit.authorize(ctx, "member.support.create");
    if (asMember.ok) {
      if (isPrivileged(asMember.value.roles)) {
        const asStaff = await kit.authorize(ctx, "admin.support.read");
        if (asStaff.ok) {
          return { ok: true, mode: "staff", actorId: asStaff.value.memberId, reads: kit.writes() };
        }
      }
      return { ok: true, mode: "member", actorId: asMember.value.memberId, reads: await kit.readsForSession() };
    }
    if (asMember.error.code !== "PERMISSION_DENIED") {
      return { ok: false, error: asMember.error };
    }
    const asStaff = await kit.authorize(ctx, "admin.support.read");
    if (!asStaff.ok) {
      return { ok: false, error: asStaff.error };
    }
    return { ok: true, mode: "staff", actorId: asStaff.value.memberId, reads: kit.writes() };
  }

  /** Not found and not yours look the same to a member, so ticket ids cannot be probed. */
  async function loadTicketFor(access: Extract<SupportAccess, { ok: true }>, ticketId: Uuid): Promise<SupportTicket | null> {
    const ticket = await supportRepo(access.reads).getTicket(ticketId);
    if (ticket === null) {
      return null;
    }
    return access.mode === "member" && ticket.memberId !== access.actorId ? null : ticket;
  }

  async function notifyMember(ctx: RequestContext, ticket: SupportTicket): Promise<void> {
    if (!deps.notifications) {
      return;
    }
    try {
      const result = await deps.notifications.notify(ctx, {
        memberId: ticket.memberId,
        type: "support_reply",
        title: "New reply from support",
        body: "We replied to your support request. Open it to read the reply.",
        link: `/app/support/${ticket.id}`,
      });
      if (!result.ok) {
        deps.onUnexpectedError?.(result.error, ctx.requestId);
      }
    } catch (error) {
      deps.onUnexpectedError?.(error, ctx.requestId);
    }
  }

  return {
    createTicket(ctx, input) {
      return kit.guard<SupportTicket>(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.support.create");
        if (!scope.ok) {
          return scope;
        }
        const parsed = ticketInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const limit = await deps.rateLimiter.check(ctx, SUPPORT_TICKET_RATE, { memberId: scope.memberId });
        if (!limit.ok) {
          return { ok: false, error: limit.error };
        }
        const ticket = await kit.writes().support.createTicket({
          memberId: scope.memberId,
          subject: parsed.data.subject,
          body: parsed.data.body,
        });
        await kit.publish(ctx, "support.ticket_changed", { ticketId: ticket.id, memberId: scope.memberId, to: ticket.status });
        return ok(ticket);
      });
    },

    reply(ctx, input) {
      return kit.guard<SupportMessage>(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.support.create");
        if (!scope.ok) {
          return scope;
        }
        const parsed = replyInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const limit = await deps.rateLimiter.check(ctx, SUPPORT_REPLY_RATE, { memberId: scope.memberId });
        if (!limit.ok) {
          return { ok: false, error: limit.error };
        }

        // Someone else's ticket and a missing ticket look the same, so ids cannot be probed.
        const ticket = await findOwnTicket(scope.reads, scope.memberId, parsed.data.ticketId);
        if (ticket === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        if (ticket.status === "closed") {
          return fail("CONFLICT", ctx.requestId, { ticketId: "This ticket is closed. Please start a new one." });
        }

        const writes = kit.writes();
        const message = await writes.support.addMessage({
          ticketId: ticket.id,
          authorId: scope.memberId,
          fromStaff: false,
          body: parsed.data.body,
        });

        // A reply hands the ticket back to staff. Not atomic with the message (no single repository method yet):
        // if this step fails the message is still delivered and the failure is reported for follow up.
        let status = ticket.status;
        if (ticket.status === "pending_member" || ticket.status === "resolved") {
          try {
            status = (await writes.support.setStatus(ticket.id, "pending_staff")).status;
          } catch (error) {
            deps.onUnexpectedError?.(error, ctx.requestId);
          }
        }
        await kit.publish(ctx, "support.ticket_changed", { ticketId: ticket.id, memberId: scope.memberId, to: status });
        return ok(message);
      });
    },

    listMine(ctx, page) {
      return kit.guard<Page<SupportTicket>>(ctx, async () => {
        const scope = await kit.memberScope(ctx, "member.support.create");
        if (!scope.ok) {
          return scope;
        }
        const parsed = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        return ok(await scope.reads.support.listByMember(scope.memberId, { limit: parsed.data.limit, cursor: parsed.data.cursor ?? null }));
      });
    },

    getTicket(ctx, input) {
      return kit.guard<SupportTicket>(ctx, async () => {
        const access = await supportAccess(ctx);
        if (!access.ok) {
          return access;
        }
        const parsed = ticketIdInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const ticket = await loadTicketFor(access, parsed.data.ticketId);
        if (ticket === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        if (access.mode === "staff") {
          await kit.audit(ctx, { action: "support.ticket.view", targetType: "support_ticket", targetId: ticket.id, result: "success" });
        }
        return ok(ticket);
      });
    },

    listMessages(ctx, input, page) {
      return kit.guard<Page<SupportMessage>>(ctx, async () => {
        const access = await supportAccess(ctx);
        if (!access.ok) {
          return access;
        }
        const parsed = ticketIdInputSchema.safeParse(input);
        const parsedPage = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        if (!parsedPage.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsedPage.error));
        }
        const ticket = await loadTicketFor(access, parsed.data.ticketId);
        if (ticket === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        if (access.mode === "staff") {
          await kit.audit(ctx, { action: "support.messages.view", targetType: "support_ticket", targetId: ticket.id, result: "success" });
        }
        return ok(await access.reads.support.listMessages(ticket.id, { limit: parsedPage.data.limit, cursor: parsedPage.data.cursor ?? null }));
      });
    },

    listForStaff(ctx, input, page) {
      return kit.guard<Page<SupportTicket>>(ctx, async () => {
        const auth = await kit.authorize(ctx, "admin.support.read");
        if (!auth.ok) {
          return { ok: false, error: auth.error };
        }
        const parsed = listForStaffInputSchema.safeParse(input);
        const parsedPage = pageRequestSchema.safeParse(page);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        if (!parsedPage.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsedPage.error));
        }
        const request = { limit: parsedPage.data.limit, cursor: parsedPage.data.cursor ?? null };
        const support = kit.writes().support;
        if (parsed.data.status !== undefined) {
          return ok(await support.listByStatus(parsed.data.status, request));
        }
        const all = await listAcrossStatuses((status, p) => support.listByStatus(status, p), request);
        if (all === null) {
          return fail("VALIDATION_FAILED", ctx.requestId, { cursor: "This page link is not valid. Go back to the first page." });
        }
        return ok(all);
      });
    },

    staffReply(ctx, input) {
      return kit.guard<SupportMessage>(ctx, async () => {
        const auth = await kit.authorize(ctx, "admin.support.reply");
        if (!auth.ok) {
          return { ok: false, error: auth.error };
        }
        const parsed = replyInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const writes = kit.writes();
        const repo = supportRepo(writes);
        const ticket = await repo.getTicket(parsed.data.ticketId);
        if (ticket === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        if (ticket.status === "closed") {
          return fail("CONFLICT", ctx.requestId, { ticketId: "This ticket is closed. Reopen it before replying." });
        }

        const message = await repo.addMessage({ ticketId: ticket.id, authorId: auth.value.memberId, fromStaff: true, body: parsed.data.body });

        // Same non atomic caveat as the member reply: the message stands even if the status step fails.
        let status = ticket.status;
        try {
          status = (await repo.setStatus(ticket.id, "pending_member")).status;
        } catch (error) {
          deps.onUnexpectedError?.(error, ctx.requestId);
        }
        await kit.audit(ctx, { action: "support.reply", targetType: "support_ticket", targetId: ticket.id, result: "success", detail: { memberId: ticket.memberId } });
        await kit.publish(ctx, "support.ticket_changed", { ticketId: ticket.id, memberId: ticket.memberId, to: status });
        await notifyMember(ctx, ticket);
        return ok(message);
      });
    },

    setStatus(ctx, input) {
      return kit.guard<SupportTicket>(ctx, async () => {
        const auth = await kit.authorize(ctx, "admin.support.reply");
        if (!auth.ok) {
          return { ok: false, error: auth.error };
        }
        const parsed = setStatusInputSchema.safeParse(input);
        if (!parsed.success) {
          return fail("VALIDATION_FAILED", ctx.requestId, fieldsFromZod(parsed.error));
        }
        const repo = supportRepo(kit.writes());
        const ticket = await repo.getTicket(parsed.data.ticketId);
        if (ticket === null) {
          return fail("NOT_FOUND", ctx.requestId);
        }
        // Setting the status it already has changes nothing, so it writes, audits and publishes nothing.
        if (ticket.status === parsed.data.status) {
          return ok(ticket);
        }
        const updated = await repo.setStatus(ticket.id, parsed.data.status);
        await kit.audit(ctx, { action: "support.ticket.status", targetType: "support_ticket", targetId: ticket.id, result: "success", detail: { from: ticket.status, to: updated.status } });
        await kit.publish(ctx, "support.ticket_changed", { ticketId: ticket.id, memberId: ticket.memberId, to: updated.status });
        return ok(updated);
      });
    },
  };
}
