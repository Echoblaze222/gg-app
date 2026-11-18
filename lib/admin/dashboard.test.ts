import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, type Result } from "../../contracts/errors";
import type { AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import type { AdminCountsRepository } from "../../contracts/v1_1";
import { createAdminDashboardService } from "./dashboard";

// All fakes live in this test file only. Nothing here is imported by production code.

const ADMIN = "11111111-1111-4111-8111-111111111111";
const ctx: RequestContext = { requestId: "req-1", actorId: ADMIN, ip: null, userAgent: null };
const session: SessionInfo = { memberId: ADMIN, roles: ["admin"], recentlyReauthenticated: false, mfaVerified: true };

const ALL_PERMISSIONS = ["admin.payouts.read", "admin.payments.read", "admin.reconciliation.read", "admin.support.read"];

const PAYOUTS = { requested: 1, verified: 2, approved: 3, processing: 4, paid: 10, rejected: 0, failed: 0, cancelled: 0 };
const STUCK = { initiating: 1, awaiting_authentication: 20, processing: 2, verifying: 3, successful: 0, failed: 0, cancelled: 0, expired: 0, reversed: 0 };
const TICKETS = { open: 3, pending_member: 4, pending_staff: 2, resolved: 9, closed: 8 };

function denied(): Result<SessionInfo> {
  return { ok: false, error: new AppError("PERMISSION_DENIED", { reference: "req-1" }).toShape() };
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}`);
  }
  return result.value;
}

function harness(
  opts: {
    allowed?: readonly string[];
    sessionProblem?: { permission: string; code: "AUTH_SESSION_EXPIRED" | "AUTH_MFA_REQUIRED" };
    payouts?: unknown;
    attempts?: unknown;
    reconciliation?: unknown;
    tickets?: unknown;
    withCounts?: boolean;
    stuckAfterSeconds?: number;
    sectionTimeoutMs?: number;
  } = {},
) {
  const allowed = new Set(opts.allowed ?? ALL_PERMISSIONS);
  const requirePermission = vi.fn(async (_ctx: RequestContext, permission: string): Promise<Result<SessionInfo>> => {
    if (opts.sessionProblem?.permission === permission) {
      return { ok: false, error: new AppError(opts.sessionProblem.code, { reference: "req-1" }).toShape() };
    }
    return allowed.has(permission) ? { ok: true, value: session } : denied();
  });
  const authorization = { requirePermission } as unknown as AuthorizationService;
  const countPayoutsByStatus = vi.fn(async () => opts.payouts ?? PAYOUTS);
  const countAttemptsByStatus = vi.fn(async (_input: { olderThanSeconds?: number }) => opts.attempts ?? STUCK);
  const countOpenReconciliationRecords = vi.fn(async () => (opts.reconciliation === undefined ? 5 : opts.reconciliation));
  const countTicketsByStatus = vi.fn(async () => opts.tickets ?? TICKETS);
  const counts = { countPayoutsByStatus, countAttemptsByStatus, countOpenReconciliationRecords, countTicketsByStatus } as unknown as AdminCountsRepository;
  const onSectionError = vi.fn();
  const onUnexpectedError = vi.fn();
  const service = createAdminDashboardService({
    authorization,
    counts: opts.withCounts === false ? undefined : counts,
    now: () => new Date("2026-11-18T10:00:00.000Z"),
    stuckAfterSeconds: opts.stuckAfterSeconds,
    sectionTimeoutMs: opts.sectionTimeoutMs,
    onSectionError,
    onUnexpectedError,
  });
  return { service, requirePermission, countPayoutsByStatus, countAttemptsByStatus, countOpenReconciliationRecords, countTicketsByStatus, onSectionError, onUnexpectedError };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("visible sections", () => {
  it("shows every section with derived numbers when all four read permissions are held", async () => {
    const h = harness();
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary.generatedAt).toBe("2026-11-18T10:00:00.000Z");
    expect(summary.payouts).toEqual({ state: "ready", data: { byStatus: PAYOUTS, awaitingApproval: 2, inProgress: 7, open: 10 } });
    expect(summary.payments).toEqual({ state: "ready", data: { stuckAfterSeconds: 900, stuck: 6, stuckByStatus: STUCK } });
    expect(summary.reconciliation).toEqual({ state: "ready", data: { open: 5 } });
    expect(summary.support).toEqual({ state: "ready", data: { byStatus: TICKETS, needsStaff: 5, waitingOnMember: 4 } });
    expect(summary.attentionTotal).toBe(2 + 6 + 5 + 5);
  });

  it("checks one permission per section", async () => {
    const h = harness();
    await h.service.getSummary(ctx);
    const asked = h.requirePermission.mock.calls.map((call) => call[1]).sort();
    expect(asked).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("shows only tickets to support staff and never asks the repository for the other sections", async () => {
    const h = harness({ allowed: ["admin.support.read"] });
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary.support?.state).toBe("ready");
    expect(summary.payouts).toBeUndefined();
    expect(summary.payments).toBeUndefined();
    expect(summary.reconciliation).toBeUndefined();
    expect(summary.attentionTotal).toBe(5);
    expect(h.countPayoutsByStatus).not.toHaveBeenCalled();
    expect(h.countAttemptsByStatus).not.toHaveBeenCalled();
    expect(h.countOpenReconciliationRecords).not.toHaveBeenCalled();
  });

  it("returns PERMISSION_DENIED and touches no counts when no section is allowed", async () => {
    const h = harness({ allowed: [] });
    const result = await h.service.getSummary(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.countPayoutsByStatus).not.toHaveBeenCalled();
    expect(h.countTicketsByStatus).not.toHaveBeenCalled();
  });

  it.each([["AUTH_SESSION_EXPIRED"], ["AUTH_MFA_REQUIRED"]] as const)("passes %s through even when other sections are allowed", async (code) => {
    const h = harness({ sessionProblem: { permission: "admin.payments.read", code } });
    const result = await h.service.getSummary(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
    }
    expect(h.countPayoutsByStatus).not.toHaveBeenCalled();
  });
});

describe("numbers", () => {
  it("treats a status missing from the repository record as zero", async () => {
    const h = harness({ payouts: { verified: 4 }, tickets: { pending_staff: 1 } });
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary.payouts).toEqual({
      state: "ready",
      data: {
        byStatus: { requested: 0, verified: 4, approved: 0, processing: 0, paid: 0, rejected: 0, failed: 0, cancelled: 0 },
        awaitingApproval: 4,
        inProgress: 0,
        open: 4,
      },
    });
    expect(summary.support).toEqual({
      state: "ready",
      data: { byStatus: { open: 0, pending_member: 0, pending_staff: 1, resolved: 0, closed: 0 }, needsStaff: 1, waitingOnMember: 0 },
    });
  });

  it("does not count awaiting_authentication as stuck", async () => {
    const h = harness({ attempts: { awaiting_authentication: 50 } });
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary.payments).toEqual(expect.objectContaining({ state: "ready", data: expect.objectContaining({ stuck: 0 }) }));
  });

  it("asks for attempts older than the threshold and reports the threshold used", async () => {
    const h = harness({ stuckAfterSeconds: 300 });
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(h.countAttemptsByStatus).toHaveBeenCalledWith({ olderThanSeconds: 300 });
    expect(summary.payments).toEqual(expect.objectContaining({ data: expect.objectContaining({ stuckAfterSeconds: 300 }) }));
  });

  it("falls back to 900 seconds for a threshold that is not a positive whole number", async () => {
    const h = harness({ stuckAfterSeconds: -5 });
    await h.service.getSummary(ctx);
    expect(h.countAttemptsByStatus).toHaveBeenCalledWith({ olderThanSeconds: 900 });
  });

  it.each([
    ["a negative count", { payouts: { verified: -1 } }, "payouts"],
    ["a fractional count", { payouts: { verified: 1.5 } }, "payouts"],
    ["NaN", { payouts: { verified: Number.NaN } }, "payouts"],
    ["a count sent as text", { tickets: { open: "3" } }, "support"],
    ["an unusably large count", { attempts: { processing: Number.MAX_SAFE_INTEGER + 2 } }, "payments"],
    ["a missing record", { tickets: null }, "support"],
    ["a negative reconciliation count", { reconciliation: -2 }, "reconciliation"],
    ["a reconciliation count that is not a number", { reconciliation: "5" }, "reconciliation"],
  ])("marks only that section unavailable for %s", async (_label, opts, section) => {
    const h = harness(opts);
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary[section as "payouts" | "payments" | "reconciliation" | "support"]).toEqual({ state: "unavailable" });
    expect(h.onSectionError).toHaveBeenCalledTimes(1);
    expect(h.onSectionError.mock.calls[0]?.[0]).toBe(section);
    expect(summary.attentionTotal).toBeNull();
    const others = ("payouts payments reconciliation support".split(" ") as Array<"payouts" | "payments" | "reconciliation" | "support">).filter((name) => name !== section);
    for (const name of others) {
      expect(summary[name]?.state).toBe("ready");
    }
  });
});

describe("failures", () => {
  it("keeps the other sections when one repository call throws, and leaks no detail", async () => {
    const h = harness();
    h.countOpenReconciliationRecords.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const result = await h.service.getSummary(ctx);
    const summary = unwrap(result);
    expect(summary.reconciliation).toEqual({ state: "unavailable" });
    expect(summary.payouts?.state).toBe("ready");
    expect(summary.support?.state).toBe("ready");
    expect(summary.attentionTotal).toBeNull();
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onSectionError).toHaveBeenCalledTimes(1);
  });

  it("shows a section as unavailable when it takes longer than the timeout, and the rest still load", async () => {
    vi.useFakeTimers();
    const h = harness({ sectionTimeoutMs: 5000 });
    h.countTicketsByStatus.mockImplementation(() => new Promise(() => undefined));
    const pending = h.service.getSummary(ctx);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    const summary = unwrap(await pending);
    expect(summary.support).toEqual({ state: "unavailable" });
    expect(summary.payouts?.state).toBe("ready");
    expect(summary.attentionTotal).toBeNull();
    expect(h.onSectionError).toHaveBeenCalledTimes(1);
  });

  it("shows every visible section as unavailable, and reports it once, when the counts repository is not wired", async () => {
    const h = harness({ withCounts: false });
    const summary = unwrap(await h.service.getSummary(ctx));
    expect(summary.payouts).toEqual({ state: "unavailable" });
    expect(summary.payments).toEqual({ state: "unavailable" });
    expect(summary.reconciliation).toEqual({ state: "unavailable" });
    expect(summary.support).toEqual({ state: "unavailable" });
    expect(summary.attentionTotal).toBeNull();
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("turns an unexpected error in the permission check into INTERNAL with the reference and no leak", async () => {
    const h = harness();
    h.requirePermission.mockRejectedValueOnce(new Error("session store down password=hunter2"));
    const result = await h.service.getSummary(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});
