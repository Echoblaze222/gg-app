import { describe, expect, it, vi } from "vitest";
import type { SupportMessage, SupportTicket } from "../../contracts/entities";
import type { Role, SupportTicketStatus } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { PermissionName } from "../../contracts/permissions";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RateLimiter, RequestContext, SessionInfo } from "../../contracts/services";
import { createSupportService } from "./service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "33333333-3333-4333-8333-333333333333";
const T_UNKNOWN = "44444444-4444-4444-8444-444444444444";
const MSG = "55555555-5555-4555-8555-555555555555";
const stamp = "2026-11-14T00:00:00.000Z";

const ctx: RequestContext = { requestId: "req-1", actorId: MEMBER_B, ip: "203.0.113.9", userAgent: "ua" };

const session = (memberId: string, roles: Role[]): Result<SessionInfo> => ({ ok: true, value: { memberId, roles, recentlyReauthenticated: false, mfaVerified: false } });
const failure = (code: "PERMISSION_DENIED" | "AUTH_SESSION_EXPIRED"): Result<SessionInfo> => ({ ok: false, error: new AppError(code, { reference: "req-1" }).toShape() });

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return { id: T1, memberId: MEMBER_A, subject: "Cannot see receipt", status: "open", createdAt: stamp, updatedAt: stamp, ...overrides };
}

function message(overrides: Partial<SupportMessage> = {}): SupportMessage {
  return { id: MSG, ticketId: T1, authorId: MEMBER_A, fromStaff: false, body: "hello", createdAt: stamp, ...overrides };
}

const memberGrant = { "member.support.create": session(MEMBER_A, ["member"]) } as const;

function harness(opts: { grants?: Partial<Record<PermissionName, Result<SessionInfo>>>; tickets?: SupportTicket[]; v11?: boolean; notify?: () => Promise<Result<unknown>> } = {}) {
  const byId = new Map((opts.tickets ?? [ticket()]).map((t) => [t.id, t]));
  const makeSupport = () => ({
    getTicket: vi.fn(async (id: string) => byId.get(id) ?? null),
    listMessages: vi.fn(async () => ({ items: [message()], nextCursor: null })),
    listByStatus: vi.fn(async (status: SupportTicketStatus) => ({ items: [...byId.values()].filter((t) => t.status === status), nextCursor: null })),
    addMessage: vi.fn(async (input: { ticketId: string; authorId: string; fromStaff: boolean; body: string }): Promise<SupportMessage> => message(input)),
    setStatus: vi.fn(async (id: string, status: SupportTicketStatus) => ({ ...(byId.get(id) ?? ticket()), status })),
  });
  const serverSupport = makeSupport();
  const sessionSupport = makeSupport();
  if (opts.v11 === false) {
    delete (serverSupport as Partial<typeof serverSupport>).getTicket;
    delete (sessionSupport as Partial<typeof sessionSupport>).getTicket;
  }
  const forSession = vi.fn(async () => ({ support: sessionSupport }) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ support: serverSupport }) as unknown as Repositories, forSession };
  const requirePermission = vi.fn(async (_ctx: RequestContext, permission: PermissionName) => opts.grants?.[permission] ?? failure("PERMISSION_DENIED"));
  const notify = vi.fn(opts.notify ?? (async () => ({ ok: true, value: {} }) as Result<unknown>));
  const record = vi.fn(async () => undefined);
  const publish = vi.fn(async () => undefined);
  const onUnexpectedError = vi.fn();
  const service = createSupportService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    rateLimiter: { check: vi.fn(async () => ({ ok: true, value: { remaining: 5 } })) } as unknown as RateLimiter,
    notifications: { notify } as never,
    audit: { record } as unknown as AuditService,
    events: { publish } as unknown as EventBus,
    now: () => new Date("2026-11-14T12:00:00.000Z"),
    newEventId: () => "evt-1",
    onUnexpectedError,
  });
  return { service, serverSupport, sessionSupport, requirePermission, notify, record, publish, onUnexpectedError };
}

describe("ticket access modes", () => {
  it("a member sees their own ticket through session reads, with one permission check", async () => {
    const h = harness({ grants: memberGrant });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledTimes(1);
    expect(h.sessionSupport.getTicket).toHaveBeenCalledWith(T1);
    expect(h.serverSupport.getTicket).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it("a member cannot see another member's ticket, and it looks like not found", async () => {
    const h = harness({ grants: memberGrant, tickets: [ticket({ memberId: MEMBER_B })] });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("a support only account falls through to the staff check, reads with the server and is audited", async () => {
    const h = harness({ grants: { "admin.support.read": session(STAFF, ["support"]) } });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(true);
    expect(h.requirePermission.mock.calls.map((c) => c[1])).toEqual(["member.support.create", "admin.support.read"]);
    expect(h.serverSupport.getTicket).toHaveBeenCalledWith(T1);
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "support.ticket.view", targetId: T1, result: "success" }));
  });

  it("an owner holding both permissions acts as staff and can see any ticket", async () => {
    const both = session(OWNER, ["owner"]);
    const h = harness({ grants: { "member.support.create": both, "admin.support.read": both } });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(true);
    expect(h.serverSupport.getTicket).toHaveBeenCalled();
    expect(h.sessionSupport.getTicket).not.toHaveBeenCalled();
  });

  it("an admin without admin.support.read stays in member mode", async () => {
    const h = harness({ grants: { "member.support.create": session(MEMBER_B, ["admin", "member"]) }, tickets: [ticket({ memberId: MEMBER_A })] });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.requirePermission).toHaveBeenCalledTimes(2);
  });

  it("does not retry the staff check when the session expired", async () => {
    const h = harness({ grants: { "member.support.create": failure("AUTH_SESSION_EXPIRED"), "admin.support.read": session(STAFF, ["support"]) } });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_SESSION_EXPIRED");
    }
    expect(h.requirePermission).toHaveBeenCalledTimes(1);
  });

  it("denies someone with neither permission", async () => {
    const h = harness({ grants: {} });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.serverSupport.getTicket).not.toHaveBeenCalled();
  });

  it("reports not found for an unknown id and rejects a malformed id", async () => {
    const h = harness({ grants: memberGrant });
    const unknown = await h.service.getTicket(ctx, { ticketId: T_UNKNOWN });
    expect(unknown.ok).toBe(false);
    const malformed = await h.service.getTicket(ctx, { ticketId: "nope" });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("fails closed with INTERNAL when the provider has no getTicket", async () => {
    const h = harness({ grants: memberGrant, v11: false });
    const result = await h.service.getTicket(ctx, { ticketId: T1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("listMessages", () => {
  it("lists the messages of the member's own ticket", async () => {
    const h = harness({ grants: memberGrant });
    const result = await h.service.listMessages(ctx, { ticketId: T1 }, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(h.sessionSupport.listMessages).toHaveBeenCalledWith(T1, { limit: 10, cursor: null });
  });

  it("reads nothing for a ticket that is not the member's", async () => {
    const h = harness({ grants: memberGrant, tickets: [ticket({ memberId: MEMBER_B })] });
    const result = await h.service.listMessages(ctx, { ticketId: T1 }, { limit: 10 });
    expect(result.ok).toBe(false);
    expect(h.sessionSupport.listMessages).not.toHaveBeenCalled();
  });

  it("audits staff reading messages", async () => {
    const h = harness({ grants: { "admin.support.read": session(STAFF, ["support"]) } });
    const result = await h.service.listMessages(ctx, { ticketId: T1 }, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "support.messages.view", targetId: T1 }));
  });

  it("rejects an out of range page size", async () => {
    const h = harness({ grants: memberGrant });
    const result = await h.service.listMessages(ctx, { ticketId: T1 }, { limit: 1000 });
    expect(result.ok).toBe(false);
    expect(h.sessionSupport.listMessages).not.toHaveBeenCalled();
  });
});

describe("staffReply", () => {
  const staffGrant = { "admin.support.reply": session(STAFF, ["support"]) } as const;
  const body = "We fixed your receipt page.";

  it("writes as staff under the verified staff id, hands the ticket to the member, audits, publishes and notifies", async () => {
    const h = harness({ grants: staffGrant, tickets: [ticket({ status: "pending_staff" })] });
    const result = await h.service.staffReply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.serverSupport.addMessage).toHaveBeenCalledWith({ ticketId: T1, authorId: STAFF, fromStaff: true, body });
    expect(h.serverSupport.setStatus).toHaveBeenCalledWith(T1, "pending_member");
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "support.reply", targetId: T1 }));
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "support.ticket_changed", data: { ticketId: T1, memberId: MEMBER_A, to: "pending_member" } }));
    expect(h.notify).toHaveBeenCalledWith(ctx, expect.objectContaining({ memberId: MEMBER_A, type: "support_reply", link: `/app/support/${T1}` }));
  });

  it("never copies the staff text into the notification", async () => {
    const h = harness({ grants: staffGrant });
    await h.service.staffReply(ctx, { ticketId: T1, body });
    const sent = h.notify.mock.calls[0]?.[1] as { title: string; body: string };
    expect(sent.title).not.toContain(body);
    expect(sent.body).not.toContain(body);
  });

  it("refuses a closed ticket and an unknown ticket, writing nothing", async () => {
    const closed = harness({ grants: staffGrant, tickets: [ticket({ status: "closed" })] });
    const closedResult = await closed.service.staffReply(ctx, { ticketId: T1, body });
    expect(closedResult.ok).toBe(false);
    if (!closedResult.ok) {
      expect(closedResult.error.code).toBe("CONFLICT");
    }
    expect(closed.serverSupport.addMessage).not.toHaveBeenCalled();

    const unknown = harness({ grants: staffGrant });
    const unknownResult = await unknown.service.staffReply(ctx, { ticketId: T_UNKNOWN, body });
    expect(unknownResult.ok).toBe(false);
    expect(unknown.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it("is denied without admin.support.reply and reads nothing", async () => {
    const h = harness({ grants: { "admin.support.read": session(STAFF, ["support"]) } });
    const result = await h.service.staffReply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(false);
    expect(h.serverSupport.getTicket).not.toHaveBeenCalled();
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it.each([[{ ticketId: "nope", body }], [{ ticketId: T1, body: "   " }], [{ ticketId: T1, body: "bad\u0000text" }], [{ ticketId: T1, body: "x".repeat(4001) }]])(
    "rejects invalid input %#",
    async (input) => {
      const h = harness({ grants: staffGrant });
      const result = await h.service.staffReply(ctx, input);
      expect(result.ok).toBe(false);
      expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a failed notification result", async () => ({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "req-1" }).toShape() }) as Result<unknown>],
    ["a throwing notification", async () => Promise.reject(new Error("notify down"))],
  ])("still succeeds with %s, and reports it", async (_name, notify) => {
    const h = harness({ grants: staffGrant, notify });
    const result = await h.service.staffReply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("delivers the message when the status step fails and reports it", async () => {
    const h = harness({ grants: staffGrant, tickets: [ticket({ status: "pending_staff" })] });
    const boom = new Error("status write failed");
    h.serverSupport.setStatus.mockRejectedValueOnce(boom);
    const result = await h.service.staffReply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledWith(boom, "req-1");
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: T1, memberId: MEMBER_A, to: "pending_staff" } }));
  });
});

describe("staff setStatus", () => {
  const staffGrant = { "admin.support.reply": session(STAFF, ["support"]) } as const;

  it("changes the status, audits the change and publishes", async () => {
    const h = harness({ grants: staffGrant });
    const result = await h.service.setStatus(ctx, { ticketId: T1, status: "resolved" });
    expect(result.ok && result.value.status).toBe("resolved");
    expect(h.serverSupport.setStatus).toHaveBeenCalledWith(T1, "resolved");
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "support.ticket.status", detail: { from: "open", to: "resolved" } }));
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: T1, memberId: MEMBER_A, to: "resolved" } }));
  });

  it("setting the status it already has writes, audits and publishes nothing", async () => {
    const h = harness({ grants: staffGrant });
    const result = await h.service.setStatus(ctx, { ticketId: T1, status: "open" });
    expect(result.ok).toBe(true);
    expect(h.serverSupport.setStatus).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("rejects an unknown status, an unknown ticket and a caller without the permission", async () => {
    const h = harness({ grants: staffGrant });
    expect((await h.service.setStatus(ctx, { ticketId: T1, status: "weird" as never })).ok).toBe(false);
    expect((await h.service.setStatus(ctx, { ticketId: T_UNKNOWN, status: "resolved" })).ok).toBe(false);
    const denied = harness({ grants: {} });
    expect((await denied.service.setStatus(ctx, { ticketId: T1, status: "resolved" })).ok).toBe(false);
    expect(denied.serverSupport.setStatus).not.toHaveBeenCalled();
  });
});

describe("listForStaff", () => {
  const readGrant = { "admin.support.read": session(STAFF, ["support"]) } as const;

  it("passes a status filter and cursor straight to the repository", async () => {
    const h = harness({ grants: readGrant });
    const result = await h.service.listForStaff(ctx, { status: "open" }, { limit: 10, cursor: "opaque-cursor" });
    expect(result.ok).toBe(true);
    expect(h.serverSupport.listByStatus).toHaveBeenCalledWith("open", { limit: 10, cursor: "opaque-cursor" });
  });

  it("without a status it starts with open tickets", async () => {
    const h = harness({ grants: readGrant });
    const result = await h.service.listForStaff(ctx, {}, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(h.serverSupport.listByStatus.mock.calls[0]?.[0]).toBe("open");
  });

  it("rejects a cursor it did not create when listing across statuses", async () => {
    const h = harness({ grants: readGrant });
    const result = await h.service.listForStaff(ctx, {}, { limit: 10, cursor: "zzz" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.cursor).toBeDefined();
    }
    expect(h.serverSupport.listByStatus).not.toHaveBeenCalled();
  });

  it("is denied without admin.support.read", async () => {
    const h = harness({ grants: memberGrant });
    const result = await h.service.listForStaff(ctx, {}, { limit: 10 });
    expect(result.ok).toBe(false);
    expect(h.serverSupport.listByStatus).not.toHaveBeenCalled();
  });
});
