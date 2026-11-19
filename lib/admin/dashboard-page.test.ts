import { describe, expect, it, vi } from "vitest";
import { AppError, type ErrorCode, type Result } from "../../contracts/errors";
import type { AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import type { AdminDashboard, AdminDashboardService } from "./dashboard";
import { loadAdminDashboardPage } from "./dashboard-page";

// All fakes live in this test file only. Nothing here is imported by production code.

const ctx: RequestContext = { requestId: "req-1", actorId: null, ip: null, userAgent: null };
const session: SessionInfo = { memberId: "11111111-1111-4111-8111-111111111111", roles: ["admin"], recentlyReauthenticated: false, mfaVerified: true };

const summary: AdminDashboard = {
  generatedAt: "2026-11-18T10:00:00.000Z",
  attentionTotal: 0,
  support: { state: "ready", data: { byStatus: { open: 0, pending_member: 0, pending_staff: 0, resolved: 0, closed: 0 }, needsStaff: 0, waitingOnMember: 0 } },
};

function failure(code: ErrorCode): Result<never> {
  return { ok: false, error: new AppError(code, { reference: "req-1" }).toShape() };
}

function setup(opts: { gate?: Result<SessionInfo>; summary?: Result<AdminDashboard> } = {}) {
  const requirePermission = vi.fn(async (_ctx: RequestContext, _permission: string): Promise<Result<SessionInfo>> => opts.gate ?? { ok: true, value: session });
  const getSummary = vi.fn(async (_ctx: RequestContext): Promise<Result<AdminDashboard>> => opts.summary ?? { ok: true, value: summary });
  const authorization = { requirePermission } as unknown as AuthorizationService;
  const dashboard: AdminDashboardService = { getSummary };
  const onUnexpectedError = vi.fn();
  return { authorization, dashboard, requirePermission, getSummary, onUnexpectedError };
}

describe("loadAdminDashboardPage", () => {
  it("returns the summary after checking the route permission", async () => {
    const s = setup();
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx });
    expect(state).toEqual({ kind: "ready", summary });
    expect(s.requirePermission).toHaveBeenCalledWith(ctx, "admin.members.read");
    expect(s.getSummary).toHaveBeenCalledWith(ctx);
  });

  it.each([
    ["AUTH_SESSION_EXPIRED", "/login"],
    ["AUTH_MFA_REQUIRED", "/mfa"],
  ] as const)("sends the browser away on %s, and never loads numbers", async (code, to) => {
    const s = setup({ gate: failure(code) });
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx });
    expect(state).toEqual({ kind: "redirect", to });
    expect(s.getSummary).not.toHaveBeenCalled();
  });

  it.each([["PERMISSION_DENIED"], ["AUTH_ACCOUNT_SUSPENDED"], ["AUTH_EMAIL_NOT_VERIFIED"]] as const)("blocks on %s without loading numbers", async (code) => {
    const s = setup({ gate: failure(code) });
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx });
    expect(state).toEqual(expect.objectContaining({ kind: "blocked", error: expect.objectContaining({ code, reference: "req-1" }) }));
    expect(s.getSummary).not.toHaveBeenCalled();
  });

  it.each([["SYSTEM_UNAVAILABLE"], ["INTERNAL"], ["RATE_LIMITED"]] as const)("reports %s from the permission check as a failure", async (code) => {
    const s = setup({ gate: failure(code) });
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx });
    expect(state).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code }) }));
    expect(s.getSummary).not.toHaveBeenCalled();
  });

  it("applies the same mapping to errors from the summary", async () => {
    const expired = setup({ summary: failure("AUTH_SESSION_EXPIRED") });
    expect(await loadAdminDashboardPage({ authorization: expired.authorization, dashboard: expired.dashboard, ctx })).toEqual({ kind: "redirect", to: "/login" });

    const denied = setup({ summary: failure("PERMISSION_DENIED") });
    expect(await loadAdminDashboardPage({ authorization: denied.authorization, dashboard: denied.dashboard, ctx })).toEqual(expect.objectContaining({ kind: "blocked" }));

    const broken = setup({ summary: failure("INTERNAL") });
    expect(await loadAdminDashboardPage({ authorization: broken.authorization, dashboard: broken.dashboard, ctx })).toEqual(expect.objectContaining({ kind: "failed" }));
  });

  it("fails with SYSTEM_UNAVAILABLE and the request reference when the services could not be built", async () => {
    const s = setup();
    const noAuthorization = await loadAdminDashboardPage({ authorization: null, dashboard: s.dashboard, ctx });
    expect(noAuthorization).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code: "SYSTEM_UNAVAILABLE", reference: "req-1" }) }));
    const noDashboard = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: null, ctx });
    expect(noDashboard).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code: "SYSTEM_UNAVAILABLE" }) }));
    expect(s.requirePermission).not.toHaveBeenCalled();
  });

  it("turns an unexpected throw into INTERNAL with the reference, reports it, and leaks nothing", async () => {
    const s = setup();
    s.requirePermission.mockRejectedValueOnce(new Error("session store down password=hunter2"));
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx, onUnexpectedError: s.onUnexpectedError });
    expect(state).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code: "INTERNAL", reference: "req-1" }) }));
    expect(JSON.stringify(state)).not.toContain("hunter2");
    expect(s.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("maps a thrown AppError like a returned one and does not report it as unexpected", async () => {
    const s = setup();
    s.getSummary.mockRejectedValueOnce(new AppError("PERMISSION_DENIED", { reference: "req-1" }));
    const state = await loadAdminDashboardPage({ authorization: s.authorization, dashboard: s.dashboard, ctx, onUnexpectedError: s.onUnexpectedError });
    expect(state).toEqual(expect.objectContaining({ kind: "blocked" }));
    expect(s.onUnexpectedError).not.toHaveBeenCalled();
  });
});
