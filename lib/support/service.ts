import type { Page, SupportMessage, SupportTicket, Uuid } from "../../contracts/entities";
import type { Repositories } from "../../contracts/repositories";
import { pageRequestSchema } from "../../contracts/schemas";
import type { RateLimitRule, RateLimiter, SupportService } from "../../contracts/services";
import { fail, ok } from "../notifications/result";
import { fieldsFromZod } from "../notifications/schemas";
import { createKit, type KitDeps } from "./kit";
import { replyInputSchema, ticketInputSchema } from "./schemas";

/** ASSUMED limits. Owner tunable. They stop floods, not normal use. */
export const SUPPORT_TICKET_RATE: RateLimitRule = { name: "support_ticket_create", limit: 5, windowSeconds: 3600 };
export const SUPPORT_REPLY_RATE: RateLimitRule = { name: "support_reply", limit: 30, windowSeconds: 3600 };

/** There is no getById on SupportRepository. Ownership is proven by scanning the member's own tickets, bounded. */
export const TICKET_SCAN_PAGE_SIZE = 100;
export const TICKET_SCAN_MAX_PAGES = 5;

export interface SupportServiceDeps extends KitDeps {
  readonly rateLimiter: RateLimiter;
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

export function createSupportService(deps: SupportServiceDeps): SupportService {
  const kit = createKit(deps);

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
  };
}
