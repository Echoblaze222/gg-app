import { describe, expect, it, vi } from "vitest";
import type { Member } from "../../contracts/entities";
import type { MemberStatus, Role } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { createAdminMemberService, ADMIN_MEMBER_STATUS_TRANSITIONS } from "./members";

// All fakes live in this test file only. Nothing here is imported by production code.

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const OWNER = "55555555-5555-4555-8555-555555555555";
const STAFF = "66666666-6666-4666-8666-666666666666";
const UNKNOWN = "77777777-7777-4777-8777-777777777777";

const ctx: RequestContext = { requestId: "req-1", actorId: ADMIN, ip: null, userAgent: null };

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    email: `${id.slice(0, 4)}@example.test`,
    phone: null,
    fullName: "Test Member",
    status: "active",
    roles: ["member"],
    emailVerifiedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as Member;
}

function denied(): Result<SessionInfo> {
  return { ok: false, error: new AppError("PERMISSION_DENIED", { reference: "req-1" }).toShape() };
}

function harness(opts: { auth?: Result<SessionInfo>; actorRoles?: Role[]; members?: Member[]; withEvents?: boolean; withRevoke?: boolean } = {}) {
  const session: SessionInfo = { memberId: ADMIN, roles: opts.actorRoles ?? ["admin"], recentlyReauthenticated: true, mfaVerified: true };
  const store = new Map<string, Member>();
  for (const m of opts.members ?? [member(ADMIN, { roles: ["admin"] }), member(TARGET)]) {
    store.set(m.id, m);
  }
  const list = vi.fn(async (_filter: { status?: MemberStatus; search?: string }, _page: { limit: number; cursor?: string | null }) => ({
    items: [...store.values()],
    nextCursor: null,
  }));
  const getById = vi.fn(async (id: string) => store.get(id) ?? null);
  const setStatus = vi.fn(async (id: string, status: MemberStatus) => {
    const current = store.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated = { ...current, status } as Member;
    store.set(id, updated);
    return updated;
  });
  const server = vi.fn(() => ({ members: { list, getById, setStatus } }) as unknown as Repositories);
  const provider: RepositoryProvider = { server, forSession: vi.fn() } as unknown as RepositoryProvider;
  const requirePermission = vi.fn(async () => opts.auth ?? ({ ok: true, value: session } as Result<SessionInfo>));
  const authorization = { requirePermission } as unknown as AuthorizationService;
  const record = vi.fn(async () => undefined);
  const audit = { record } as unknown as AuditService;
  const publish = vi.fn(async () => undefined);
  const events = { publish } as unknown as EventBus;
  const revokeAllSessions = vi.fn(async (_id: string): Promise<void> => undefined);
  const onSessionRevokeError = vi.fn();
  const onPublishError = vi.fn();
  const onUnexpectedError = vi.fn();
  const service = createAdminMemberService({
    repositories: provider,
    authorization,
    audit,
    events: opts.withEvents === false ? undefined : events,
    now: () => new Date("2026-11-16T21:00:00.000Z"),
    newEventId: () => "evt-1",
    revokeAllSessions: opts.withRevoke === false ? undefined : revokeAllSessions,
    onSessionRevokeError,
    onPublishError,
    onUnexpectedError,
  });
  return { service, server, list, getById, setStatus, requirePermission, record, publish, revokeAllSessions, onSessionRevokeError, onPublishError, onUnexpectedError, store };
}

const reason = "Repeated chargebacks, see support ticket.";

describe("list", () => {
  it("checks the read permission and passes the filter, trimmed search and page through", async () => {
    const h = harness();
    const result = await h.service.list(ctx, { status: "active", search: "  ada  " }, { limit: 25 });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "admin.members.read");
    expect(h.list).toHaveBeenCalledWith({ status: "active", search: "ada" }, { limit: 25, cursor: null });
  });

  it("treats an empty or blank search as no search", async () => {
    const h = harness();
    await h.service.list(ctx, { search: "   " }, { limit: 10 });
    expect(h.list).toHaveBeenCalledWith({}, { limit: 10, cursor: null });
  });

  it("does not read members when permission is denied", async () => {
    const h = harness({ auth: denied() });
    const result = await h.service.list(ctx, {}, { limit: 10 });
    expect(result.ok).toBe(false);
    expect(h.server).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown status", { status: "banned" }],
    ["search over 100", { search: "x".repeat(101) }],
    ["control character in search", { search: "ada\u0000" }],
    ["line break in search", { search: "ada\nbob" }],
    ["bidi override in search", { search: "ada‮bob" }],
  ])("rejects %s", async (_label, input) => {
    const h = harness();
    const result = await h.service.list(ctx, input as { status?: MemberStatus; search?: string }, { limit: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.list).not.toHaveBeenCalled();
  });

  it("rejects an out of range page size", async () => {
    const h = harness();
    const result = await h.service.list(ctx, {}, { limit: 1000 });
    expect(result.ok).toBe(false);
    expect(h.list).not.toHaveBeenCalled();
  });
});

describe("get", () => {
  it("returns the member and records that staff viewed it", async () => {
    const h = harness();
    const result = await h.service.get(ctx, { memberId: TARGET });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "admin.members.read");
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "admin.member.view", targetId: TARGET, result: "success" }));
  });

  it("returns NOT_FOUND for an unknown member and records nothing", async () => {
    const h = harness();
    const result = await h.service.get(ctx, { memberId: UNKNOWN });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.record).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid before touching the repository", async () => {
    const h = harness();
    const result = await h.service.get(ctx, { memberId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.getById).not.toHaveBeenCalled();
  });

  it("blocks before the repository when permission is denied", async () => {
    const h = harness({ auth: denied() });
    const result = await h.service.get(ctx, { memberId: TARGET });
    expect(result.ok).toBe(false);
    expect(h.getById).not.toHaveBeenCalled();
  });

  it("still returns the member when the audit write fails, and reports it", async () => {
    const h = harness();
    h.record.mockRejectedValueOnce(new Error("audit down"));
    const result = await h.service.get(ctx, { memberId: TARGET });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("setStatus", () => {
  it("suspends an active member: reauth required, audited with reason, event published, sessions revoked", async () => {
    const h = harness();
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("suspended");
    }
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "admin.members.suspend", { requireReauth: true });
    expect(h.setStatus).toHaveBeenCalledWith(TARGET, "suspended");
    expect(h.record).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ action: "admin.member.set_status", targetId: TARGET, result: "success", detail: { from: "active", to: "suspended", reason } }),
    );
    expect(h.publish).toHaveBeenCalledWith({
      id: "evt-1",
      name: "member.status_changed",
      occurredAt: "2026-11-16T21:00:00.000Z",
      requestId: "req-1",
      actorId: ADMIN,
      data: { memberId: TARGET, from: "active", to: "suspended" },
    });
    expect(h.revokeAllSessions).toHaveBeenCalledWith(TARGET);
  });

  it("reactivates a suspended member and does not revoke sessions", async () => {
    const h = harness({ members: [member(ADMIN, { roles: ["admin"] }), member(TARGET, { status: "suspended" })] });
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "active", reason });
    expect(result.ok).toBe(true);
    expect(h.setStatus).toHaveBeenCalledWith(TARGET, "active");
    expect(h.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("blocks before any read when reauthentication or permission is missing", async () => {
    const h = harness({ auth: denied() });
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(false);
    expect(h.getById).not.toHaveBeenCalled();
    expect(h.setStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["no reason", { memberId: TARGET, status: "suspended", reason: "  " }],
    ["reason too short", { memberId: TARGET, status: "suspended", reason: "ab" }],
    ["reason over 500", { memberId: TARGET, status: "suspended", reason: "x".repeat(501) }],
    ["line break in reason", { memberId: TARGET, status: "suspended", reason: "first\nsecond" }],
    ["NUL in reason", { memberId: TARGET, status: "suspended", reason: "first\u0000second" }],
    ["unknown status", { memberId: TARGET, status: "banned", reason }],
    ["bad member id", { memberId: "abc", status: "suspended", reason }],
  ])("rejects %s and changes nothing", async (_label, input) => {
    const h = harness();
    const result = await h.service.setStatus(ctx, input as { memberId: string; status: MemberStatus; reason: string });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.setStatus).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown member", async () => {
    const h = harness();
    const result = await h.service.setStatus(ctx, { memberId: UNKNOWN, status: "suspended", reason });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.setStatus).not.toHaveBeenCalled();
  });

  it("refuses to change your own status and records the refusal", async () => {
    const h = harness();
    const result = await h.service.setStatus(ctx, { memberId: ADMIN, status: "suspended", reason });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "denied", detail: { refusal: "self", from: "active", to: "suspended" } }));
  });

  it("never lets anyone change an owner, not even another owner", async () => {
    const members = [member(ADMIN, { roles: ["owner"] }), member(OWNER, { roles: ["owner"] })];
    const h = harness({ actorRoles: ["owner"], members });
    const result = await h.service.setStatus(ctx, { memberId: OWNER, status: "suspended", reason });
    expect(result.ok).toBe(false);
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "denied", detail: expect.objectContaining({ refusal: "owner_protected" }) }));
  });

  it.each([["admin"], ["support"]] as const)("lets an admin not change a %s member, but lets an owner", async (role) => {
    const members = [member(ADMIN, { roles: ["admin"] }), member(STAFF, { roles: [role] })];
    const asAdmin = harness({ members });
    const blocked = await asAdmin.service.setStatus(ctx, { memberId: STAFF, status: "suspended", reason });
    expect(blocked.ok).toBe(false);
    expect(asAdmin.setStatus).not.toHaveBeenCalled();
    expect(asAdmin.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "denied", detail: expect.objectContaining({ refusal: "owner_only" }) }));

    const asOwner = harness({ actorRoles: ["owner"], members: [member(ADMIN, { roles: ["owner"] }), member(STAFF, { roles: [role] })] });
    const allowed = await asOwner.service.setStatus(ctx, { memberId: STAFF, status: "suspended", reason });
    expect(allowed.ok).toBe(true);
    expect(asOwner.setStatus).toHaveBeenCalledWith(STAFF, "suspended");
  });

  it.each([
    ["pending_verification", "active"],
    ["active", "closed"],
    ["closed", "active"],
    ["suspended", "closed"],
    ["active", "pending_verification"],
  ] as const)("does not allow %s to %s", async (from, to) => {
    const h = harness({ members: [member(ADMIN, { roles: ["admin"] }), member(TARGET, { status: from })] });
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: to, reason });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.status).toBeDefined();
    }
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "denied", detail: { refusal: "transition_not_allowed", from, to } }));
  });

  it("is a quiet no op when the member already has the status", async () => {
    const h = harness();
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "active", reason });
    expect(result.ok).toBe(true);
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("still succeeds when session revocation fails, and raises the alert callback", async () => {
    const h = harness();
    h.revokeAllSessions.mockRejectedValueOnce(new Error("session store down password=hunter2"));
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(true);
    expect(h.onSessionRevokeError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("still succeeds when the event bus fails, and reports it", async () => {
    const h = harness();
    h.publish.mockRejectedValueOnce(new Error("bus down"));
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(true);
    expect(h.onPublishError).toHaveBeenCalledTimes(1);
    expect(h.revokeAllSessions).toHaveBeenCalledWith(TARGET);
  });

  it("works without the optional event bus and revoke hook", async () => {
    const h = harness({ withEvents: false, withRevoke: false });
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(true);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("turns an unexpected repository error into INTERNAL with the reference and no leaked detail", async () => {
    const h = harness();
    h.setStatus.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const result = await h.service.setStatus(ctx, { memberId: TARGET, status: "suspended", reason });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });
});

describe("status transition table", () => {
  it("allows staff to move only between active and suspended", () => {
    expect(ADMIN_MEMBER_STATUS_TRANSITIONS).toEqual({
      pending_verification: [],
      active: ["suspended"],
      suspended: ["active"],
      closed: [],
    });
  });
});
