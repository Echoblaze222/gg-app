import { describe, expect, it, vi } from "vitest";
import type { PrivacyRequest } from "../../contracts/entities";
import type { PrivacyRequestKind, PrivacyRequestStatus } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RateLimiter, RequestContext, SessionInfo } from "../../contracts/services";
import { PRIVACY_REQUEST_RATE, createPrivacyService } from "./privacy-service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const REQ = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-11-14T00:00:00.000Z";

const ctx: RequestContext = { requestId: "req-1", actorId: MEMBER_B, ip: "203.0.113.9", userAgent: "ua" };
const session: SessionInfo = { memberId: MEMBER_A, roles: ["member"], recentlyReauthenticated: false, mfaVerified: false };

function request(kind: PrivacyRequestKind = "access", status: PrivacyRequestStatus = "received", id: string = REQ): PrivacyRequest {
  return { id, memberId: MEMBER_A, kind, status, createdAt: stamp, resolvedAt: null };
}

function harness(opts: { existing?: PrivacyRequest[]; auth?: Result<SessionInfo>; reauth?: Result<SessionInfo>; limit?: Result<{ remaining: number }> } = {}) {
  const serverPrivacy = { create: vi.fn(async (input: { memberId: string; kind: PrivacyRequestKind }) => request(input.kind)) };
  const sessionPrivacy = { listByMember: vi.fn(async () => opts.existing ?? []) };
  const forSession = vi.fn(async () => ({ privacyRequests: sessionPrivacy }) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ privacyRequests: serverPrivacy }) as unknown as Repositories, forSession };
  const okSession = { ok: true, value: session } as Result<SessionInfo>;
  const requirePermission = vi.fn(async (_ctx: RequestContext, _permission: string, o?: { requireReauth?: boolean }) =>
    o?.requireReauth ? (opts.reauth ?? okSession) : (opts.auth ?? okSession),
  );
  const check = vi.fn(async () => opts.limit ?? ({ ok: true, value: { remaining: 2 } } as Result<{ remaining: number }>));
  const record = vi.fn(async () => undefined);
  const publish = vi.fn(async () => undefined);
  const onUnexpectedError = vi.fn();
  const service = createPrivacyService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    rateLimiter: { check } as unknown as RateLimiter,
    audit: { record } as unknown as AuditService,
    events: { publish } as unknown as EventBus,
    now: () => new Date("2026-11-14T12:00:00.000Z"),
    newEventId: () => "evt-1",
    onUnexpectedError,
  });
  return { service, serverPrivacy, sessionPrivacy, forSession, requirePermission, check, record, publish, onUnexpectedError };
}

const reauthNeeded: Result<SessionInfo> = { ok: false, error: new AppError("AUTH_REAUTH_REQUIRED", { reference: "req-1" }).toShape() };

describe("createRequest", () => {
  it("creates, audits and publishes, with one permission check for a non deletion request", async () => {
    const h = harness();
    const result = await h.service.createRequest(ctx, { kind: "access" });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledTimes(1);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.privacy.request");
    expect(h.check).toHaveBeenCalledWith(ctx, PRIVACY_REQUEST_RATE, { memberId: MEMBER_A });
    expect(h.serverPrivacy.create).toHaveBeenCalledWith({ memberId: MEMBER_A, kind: "access" });
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "privacy.request.create", targetType: "privacy_request", targetId: REQ, result: "success", detail: { kind: "access" } }));
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "privacy.request_created", data: { requestId: REQ, memberId: MEMBER_A, kind: "access" } }));
  });

  it.each([["received"], ["in_review"]] as const)("returns the open %s request of the same kind instead of creating a duplicate", async (status) => {
    const open = request("export", status, "existing-id");
    const h = harness({ existing: [open] });
    const result = await h.service.createRequest(ctx, { kind: "export" });
    expect(result).toEqual({ ok: true, value: open });
    expect(h.check).not.toHaveBeenCalled();
    expect(h.serverPrivacy.create).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("creates a new request when the earlier one of that kind is finished or the open one is a different kind", async () => {
    const h = harness({ existing: [request("access", "completed", "a"), request("access", "rejected", "b"), request("correction", "received", "c")] });
    const result = await h.service.createRequest(ctx, { kind: "access" });
    expect(result.ok).toBe(true);
    expect(h.serverPrivacy.create).toHaveBeenCalledTimes(1);
  });

  it("asks for the password again for a deletion request before anything is created", async () => {
    const h = harness({ reauth: reauthNeeded });
    const result = await h.service.createRequest(ctx, { kind: "deletion" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_REAUTH_REQUIRED");
    }
    expect(h.requirePermission).toHaveBeenNthCalledWith(2, ctx, "member.privacy.request", { requireReauth: true });
    expect(h.sessionPrivacy.listByMember).not.toHaveBeenCalled();
    expect(h.check).not.toHaveBeenCalled();
    expect(h.serverPrivacy.create).not.toHaveBeenCalled();
  });

  it("creates a deletion request once the password was confirmed", async () => {
    const h = harness();
    const result = await h.service.createRequest(ctx, { kind: "deletion" });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledTimes(2);
    expect(h.serverPrivacy.create).toHaveBeenCalledWith({ memberId: MEMBER_A, kind: "deletion" });
  });

  it("returns the rate limit failure and creates nothing", async () => {
    const limited: Result<{ remaining: number }> = { ok: false, error: new AppError("RATE_LIMITED", { reference: "req-1" }).toShape() };
    const h = harness({ limit: limited });
    const result = await h.service.createRequest(ctx, { kind: "access" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
    }
    expect(h.serverPrivacy.create).not.toHaveBeenCalled();
  });

  it.each([[{ kind: "erase_everything" }], [{}], [{ kind: 5 }]])("rejects invalid input %j", async (input) => {
    const h = harness();
    const result = await h.service.createRequest(ctx, input as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.serverPrivacy.create).not.toHaveBeenCalled();
  });

  it("stops at the permission check", async () => {
    const denied: Result<SessionInfo> = { ok: false, error: new AppError("PERMISSION_DENIED", { reference: "req-1" }).toShape() };
    const h = harness({ auth: denied });
    const result = await h.service.createRequest(ctx, { kind: "access" });
    expect(result.ok).toBe(false);
    expect(h.forSession).not.toHaveBeenCalled();
    expect(h.serverPrivacy.create).not.toHaveBeenCalled();
  });

  it("still succeeds when the audit write fails, and reports it", async () => {
    const h = harness();
    const boom = new Error("audit down");
    h.record.mockRejectedValueOnce(boom);
    const result = await h.service.createRequest(ctx, { kind: "access" });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledWith(boom, "req-1");
  });
});

describe("listMine", () => {
  it("lists for the verified member", async () => {
    const mine = [request()];
    const h = harness({ existing: mine });
    const result = await h.service.listMine(ctx);
    expect(result).toEqual({ ok: true, value: mine });
    expect(h.sessionPrivacy.listByMember).toHaveBeenCalledWith(MEMBER_A);
  });
});
