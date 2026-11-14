import { describe, expect, it, vi } from "vitest";
import type { Notification } from "../../contracts/entities";
import { AppError, type AppErrorShape, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { createNotificationService } from "./service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const ID_1 = "33333333-3333-4333-8333-333333333333";
const ID_2 = "44444444-4444-4444-8444-444444444444";

const ctx: RequestContext = { requestId: "req-1", actorId: MEMBER_B, ip: null, userAgent: null };

function stored(overrides: Partial<Notification> = {}): Notification {
  return {
    id: ID_1,
    memberId: MEMBER_A,
    type: "payment_successful",
    channel: "in_app",
    title: "Payment received",
    body: "We confirmed your payment.",
    link: "/app/history",
    readAt: null,
    createdAt: "2026-11-14T00:00:00.000Z",
    ...overrides,
  };
}

const session: SessionInfo = { memberId: MEMBER_A, roles: ["member"], recentlyReauthenticated: false, mfaVerified: false };

function denied(code: "PERMISSION_DENIED" | "AUTH_SESSION_EXPIRED"): Result<SessionInfo> {
  const shape: AppErrorShape = new AppError(code, { reference: "req-1" }).toShape();
  return { ok: false, error: shape };
}

function harness(opts: { auth?: Result<SessionInfo>; events?: EventBus } = {}) {
  const serverNotifications = { create: vi.fn(async () => stored()) };
  const sessionNotifications = {
    listByMember: vi.fn(async () => ({ items: [stored()], nextCursor: null })),
    unreadCount: vi.fn(async () => 3),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
  };
  const forSession = vi.fn(async () => ({ notifications: sessionNotifications }) as unknown as Repositories);
  const provider: RepositoryProvider = {
    server: () => ({ notifications: serverNotifications }) as unknown as Repositories,
    forSession,
  };
  const requirePermission = vi.fn(async () => opts.auth ?? ({ ok: true, value: session } as Result<SessionInfo>));
  const authorization = { requirePermission } as unknown as AuthorizationService;
  const onPublishError = vi.fn();
  const onUnexpectedError = vi.fn();
  const service = createNotificationService({
    repositories: provider,
    authorization,
    events: opts.events,
    now: () => new Date("2026-11-14T12:00:00.000Z"),
    newEventId: () => "evt-1",
    onPublishError,
    onUnexpectedError,
  });
  return { service, serverNotifications, sessionNotifications, forSession, requirePermission, onPublishError, onUnexpectedError };
}

const validNotify = { memberId: MEMBER_A, type: "payment_successful", title: "Payment received", body: "We confirmed your payment.", link: "/app/history/GG-0001" } as const;

describe("notify", () => {
  it("stores an in app notification and publishes notification.created with ids only", async () => {
    const publish = vi.fn(async () => undefined);
    const h = harness({ events: { publish } });
    const result = await h.service.notify(ctx, validNotify);
    expect(result.ok).toBe(true);
    expect(h.serverNotifications.create).toHaveBeenCalledWith({
      memberId: MEMBER_A,
      type: "payment_successful",
      channel: "in_app",
      title: "Payment received",
      body: "We confirmed your payment.",
      link: "/app/history/GG-0001",
    });
    expect(publish).toHaveBeenCalledWith({
      id: "evt-1",
      name: "notification.created",
      occurredAt: "2026-11-14T12:00:00.000Z",
      requestId: "req-1",
      actorId: MEMBER_B,
      data: { notificationId: ID_1, memberId: MEMBER_A },
    });
  });

  it.each([
    ["https://evil.example/pay"],
    ["//evil.example"],
    ["/admin/roles"],
    ["/app/../admin"],
    ["/app/history?next=https://evil.example"],
    ["javascript:alert(1)"],
  ])("rejects the link %s and stores nothing", async (link) => {
    const h = harness();
    const result = await h.service.notify(ctx, { ...validNotify, link });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.link).toBeDefined();
    }
    expect(h.serverNotifications.create).not.toHaveBeenCalled();
  });

  it("rejects empty text and unknown types", async () => {
    const h = harness();
    const empty = await h.service.notify(ctx, { ...validNotify, title: "   " });
    expect(empty.ok).toBe(false);
    const unknownType = await h.service.notify(ctx, { ...validNotify, type: "free_money" as never });
    expect(unknownType.ok).toBe(false);
    expect(h.serverNotifications.create).not.toHaveBeenCalled();
  });

  it("still succeeds when publishing fails, and reports the publish failure", async () => {
    const boom = new Error("bus down");
    const h = harness({ events: { publish: vi.fn(async () => Promise.reject(boom)) } });
    const result = await h.service.notify(ctx, validNotify);
    expect(result.ok).toBe(true);
    expect(h.onPublishError).toHaveBeenCalledWith(boom, "req-1");
  });
});

describe("member reads", () => {
  it("blocks before touching the session repositories when permission is denied", async () => {
    const h = harness({ auth: denied("PERMISSION_DENIED") });
    const result = await h.service.list(ctx, { limit: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.forSession).not.toHaveBeenCalled();
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.profile.read");
  });

  it("uses the member id from the verified session, not from the caller context", async () => {
    const h = harness();
    await h.service.list(ctx, { limit: 10 });
    expect(h.sessionNotifications.listByMember).toHaveBeenCalledWith(MEMBER_A, { limit: 10, cursor: null });
    await h.service.unreadCount(ctx);
    expect(h.sessionNotifications.unreadCount).toHaveBeenCalledWith(MEMBER_A);
    await h.service.markAllRead(ctx);
    expect(h.sessionNotifications.markAllRead).toHaveBeenCalledWith(MEMBER_A);
  });

  it("rejects an out of range page size", async () => {
    const h = harness();
    const result = await h.service.list(ctx, { limit: 1000 });
    expect(result.ok).toBe(false);
    expect(h.sessionNotifications.listByMember).not.toHaveBeenCalled();
  });

  it("markRead validates ids and removes duplicates", async () => {
    const h = harness();
    const good = await h.service.markRead(ctx, { ids: [ID_1, ID_2, ID_1] });
    expect(good.ok).toBe(true);
    expect(h.sessionNotifications.markRead).toHaveBeenCalledWith(MEMBER_A, [ID_1, ID_2]);

    const empty = await h.service.markRead(ctx, { ids: [] });
    const notUuid = await h.service.markRead(ctx, { ids: ["abc"] });
    const tooMany = await h.service.markRead(ctx, { ids: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) });
    expect(empty.ok).toBe(false);
    expect(notUuid.ok).toBe(false);
    expect(tooMany.ok).toBe(false);
    expect(h.sessionNotifications.markRead).toHaveBeenCalledTimes(1);
  });
});

describe("failure handling", () => {
  it("turns an unexpected error into INTERNAL with the request reference and no leaked detail", async () => {
    const h = harness();
    h.sessionNotifications.unreadCount.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const result = await h.service.unreadCount(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("keeps a known AppError code and does not log it as unexpected", async () => {
    const h = harness();
    h.forSession.mockRejectedValueOnce(new AppError("AUTH_SESSION_EXPIRED", { reference: "req-1" }));
    const result = await h.service.list(ctx, { limit: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_SESSION_EXPIRED");
    }
    expect(h.onUnexpectedError).not.toHaveBeenCalled();
  });
});
