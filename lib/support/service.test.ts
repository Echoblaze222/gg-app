import { describe, expect, it, vi } from "vitest";
import type { Page, SupportMessage, SupportTicket } from "../../contracts/entities";
import type { SupportTicketStatus } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuthorizationService, RateLimiter, RequestContext, SessionInfo } from "../../contracts/services";
import { SUPPORT_REPLY_RATE, SUPPORT_TICKET_RATE, TICKET_SCAN_MAX_PAGES, createSupportService } from "./service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const T_OTHER = "44444444-4444-4444-8444-444444444444";
const MSG = "55555555-5555-4555-8555-555555555555";

const ctx: RequestContext = { requestId: "req-1", actorId: MEMBER_B, ip: "203.0.113.9", userAgent: "ua" };
const session: SessionInfo = { memberId: MEMBER_A, roles: ["member"], recentlyReauthenticated: false, mfaVerified: false };
const stamp = "2026-11-14T00:00:00.000Z";

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return { id: T1, memberId: MEMBER_A, subject: "Cannot see receipt", status: "open", createdAt: stamp, updatedAt: stamp, ...overrides };
}

function harness(opts: { auth?: Result<SessionInfo>; limit?: Result<{ remaining: number }> } = {}) {
  const serverSupport = {
    createTicket: vi.fn(async (input: { memberId: string; subject: string; body: string }) => ticket({ memberId: input.memberId, subject: input.subject })),
    addMessage: vi.fn(
      async (input: { ticketId: string; authorId: string; fromStaff: boolean; body: string }): Promise<SupportMessage> => ({ id: MSG, createdAt: stamp, ...input }),
    ),
    setStatus: vi.fn(async (_id: string, status: SupportTicketStatus) => ticket({ status })),
  };
  const sessionSupport = {
    listByMember: vi.fn(async (): Promise<Page<SupportTicket>> => ({ items: [ticket()], nextCursor: null })),
  };
  const forSession = vi.fn(async () => ({ support: sessionSupport }) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ support: serverSupport }) as unknown as Repositories, forSession };
  const requirePermission = vi.fn(async () => opts.auth ?? ({ ok: true, value: session } as Result<SessionInfo>));
  const check = vi.fn(async () => opts.limit ?? ({ ok: true, value: { remaining: 4 } } as Result<{ remaining: number }>));
  const publish = vi.fn(async () => undefined);
  const onPublishError = vi.fn();
  const onUnexpectedError = vi.fn();
  const service = createSupportService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    rateLimiter: { check } as unknown as RateLimiter,
    events: { publish } as unknown as EventBus,
    now: () => new Date("2026-11-14T12:00:00.000Z"),
    newEventId: () => "evt-1",
    onPublishError,
    onUnexpectedError,
  });
  return { service, serverSupport, sessionSupport, forSession, requirePermission, check, publish, onPublishError, onUnexpectedError };
}

const validTicket = { subject: "Cannot see receipt", body: "The receipt page is blank." };

describe("createTicket", () => {
  it("checks permission, limits the rate, writes with the server repository and publishes", async () => {
    const h = harness();
    const result = await h.service.createTicket(ctx, { subject: "  Cannot see receipt  ", body: "  The receipt page is blank.  " });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.support.create");
    expect(h.check).toHaveBeenCalledWith(ctx, SUPPORT_TICKET_RATE, { memberId: MEMBER_A });
    expect(h.serverSupport.createTicket).toHaveBeenCalledWith({ memberId: MEMBER_A, ...validTicket });
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "support.ticket_changed", data: { ticketId: T1, memberId: MEMBER_A, to: "open" } }));
  });

  it.each([
    [{ subject: "ab", body: "long enough body" }, "subject"],
    [{ subject: "x".repeat(121), body: "long enough body" }, "subject"],
    [{ subject: "A subject", body: "abcd" }, "body"],
    [{ subject: "A subject", body: "x".repeat(4001) }, "body"],
    [{ subject: "A subject", body: "bad\u0000text here" }, "body"],
    [{ subject: "bad\u0000subject", body: "long enough body" }, "subject"],
  ])("rejects invalid input %#, uses no rate limit and stores nothing", async (input, field) => {
    const h = harness();
    const result = await h.service.createTicket(ctx, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.[field]).toBeDefined();
    }
    expect(h.check).not.toHaveBeenCalled();
    expect(h.serverSupport.createTicket).not.toHaveBeenCalled();
  });

  it("returns the rate limit failure and stores nothing", async () => {
    const limited: Result<{ remaining: number }> = { ok: false, error: new AppError("RATE_LIMITED", { reference: "req-1" }).toShape() };
    const h = harness({ limit: limited });
    const result = await h.service.createTicket(ctx, validTicket);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
    }
    expect(h.serverSupport.createTicket).not.toHaveBeenCalled();
  });

  it("stops at the permission check", async () => {
    const denied: Result<SessionInfo> = { ok: false, error: new AppError("PERMISSION_DENIED", { reference: "req-1" }).toShape() };
    const h = harness({ auth: denied });
    const result = await h.service.createTicket(ctx, validTicket);
    expect(result.ok).toBe(false);
    expect(h.forSession).not.toHaveBeenCalled();
    expect(h.check).not.toHaveBeenCalled();
    expect(h.serverSupport.createTicket).not.toHaveBeenCalled();
  });

  it("turns an unexpected error into INTERNAL without leaking its message", async () => {
    const h = harness();
    h.serverSupport.createTicket.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const result = await h.service.createTicket(ctx, validTicket);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when publishing fails and reports it", async () => {
    const h = harness();
    const boom = new Error("bus down");
    h.publish.mockRejectedValueOnce(boom);
    const result = await h.service.createTicket(ctx, validTicket);
    expect(result.ok).toBe(true);
    expect(h.onPublishError).toHaveBeenCalledWith(boom, "req-1");
  });
});

describe("reply", () => {
  const body = "Here is more detail.";

  it("writes as the verified member, never as staff and never as the caller context", async () => {
    const h = harness();
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.check).toHaveBeenCalledWith(ctx, SUPPORT_REPLY_RATE, { memberId: MEMBER_A });
    expect(h.serverSupport.addMessage).toHaveBeenCalledWith({ ticketId: T1, authorId: MEMBER_A, fromStaff: false, body });
  });

  it.each([
    ["open", false, "open"],
    ["pending_staff", false, "pending_staff"],
    ["pending_member", true, "pending_staff"],
    ["resolved", true, "pending_staff"],
  ] as const)("a reply on a %s ticket hands it back to staff: %s", async (status, shouldSet, expectedTo) => {
    const h = harness();
    h.sessionSupport.listByMember.mockResolvedValueOnce({ items: [ticket({ status })], nextCursor: null });
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    if (shouldSet) {
      expect(h.serverSupport.setStatus).toHaveBeenCalledWith(T1, "pending_staff");
    } else {
      expect(h.serverSupport.setStatus).not.toHaveBeenCalled();
    }
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "support.ticket_changed", data: { ticketId: T1, memberId: MEMBER_A, to: expectedTo } }));
  });

  it("treats a ticket that is not in the member's own list as not found, and writes nothing", async () => {
    const h = harness();
    h.sessionSupport.listByMember.mockResolvedValueOnce({ items: [], nextCursor: null });
    const result = await h.service.reply(ctx, { ticketId: T_OTHER, body });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it("finds a ticket on a later page", async () => {
    const h = harness();
    h.sessionSupport.listByMember
      .mockResolvedValueOnce({ items: [ticket({ id: T_OTHER })], nextCursor: "c1" })
      .mockResolvedValueOnce({ items: [ticket()], nextCursor: null });
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.sessionSupport.listByMember).toHaveBeenNthCalledWith(2, MEMBER_A, { limit: 100, cursor: "c1" });
  });

  it("stops scanning after the page limit and fails closed", async () => {
    const h = harness();
    h.sessionSupport.listByMember.mockImplementation(async () => ({ items: [], nextCursor: "more" }));
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.sessionSupport.listByMember).toHaveBeenCalledTimes(TICKET_SCAN_MAX_PAGES);
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it("refuses to reply on a closed ticket and says why", async () => {
    const h = harness();
    h.sessionSupport.listByMember.mockResolvedValueOnce({ items: [ticket({ status: "closed" })], nextCursor: null });
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.ticketId).toContain("closed");
    }
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it("delivers the message even when the status step fails, and reports the failure", async () => {
    const h = harness();
    const boom = new Error("status write failed");
    h.sessionSupport.listByMember.mockResolvedValueOnce({ items: [ticket({ status: "pending_member" })], nextCursor: null });
    h.serverSupport.setStatus.mockRejectedValueOnce(boom);
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledWith(boom, "req-1");
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: T1, memberId: MEMBER_A, to: "pending_member" } }));
  });

  it.each([
    [{ ticketId: "nope", body: "Here is more detail." }],
    [{ ticketId: T1, body: "   " }],
    [{ ticketId: T1, body: "x".repeat(4001) }],
    [{ ticketId: T1, body: "bad\u0000text" }],
  ])("rejects invalid input %#, uses no rate limit and writes nothing", async (input) => {
    const h = harness();
    const result = await h.service.reply(ctx, input);
    expect(result.ok).toBe(false);
    expect(h.check).not.toHaveBeenCalled();
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });

  it("returns the rate limit failure before any lookup", async () => {
    const limited: Result<{ remaining: number }> = { ok: false, error: new AppError("RATE_LIMITED", { reference: "req-1" }).toShape() };
    const h = harness({ limit: limited });
    const result = await h.service.reply(ctx, { ticketId: T1, body });
    expect(result.ok).toBe(false);
    expect(h.sessionSupport.listByMember).not.toHaveBeenCalled();
    expect(h.serverSupport.addMessage).not.toHaveBeenCalled();
  });
});

describe("listMine", () => {
  it("lists with the member id from the session", async () => {
    const h = harness();
    const result = await h.service.listMine(ctx, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(h.sessionSupport.listByMember).toHaveBeenCalledWith(MEMBER_A, { limit: 10, cursor: null });
  });

  it("rejects an out of range page size", async () => {
    const h = harness();
    const result = await h.service.listMine(ctx, { limit: 1000 });
    expect(result.ok).toBe(false);
    expect(h.sessionSupport.listByMember).not.toHaveBeenCalled();
  });
});
