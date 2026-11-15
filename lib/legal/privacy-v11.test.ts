import { describe, expect, it, vi } from "vitest";
import type { Balance, PayoutRequest, PrivacyRequest } from "../../contracts/entities";
import type { PrivacyRequestKind, PrivacyRequestStatus, Role } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { PermissionName } from "../../contracts/permissions";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RateLimiter, RequestContext, SessionInfo } from "../../contracts/services";
import { PAYOUT_SCAN_MAX_PAGES, createPrivacyService, type DeletionExecutor } from "./privacy-service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQ = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-11-14T00:00:00.000Z";

const ctx: RequestContext = { requestId: "req-1", actorId: ADMIN, ip: "203.0.113.9", userAgent: "ua" };
const session = (memberId: string, roles: Role[]): Result<SessionInfo> => ({ ok: true, value: { memberId, roles, recentlyReauthenticated: true, mfaVerified: true } });
const failure = (code: "PERMISSION_DENIED" | "AUTH_REAUTH_REQUIRED"): Result<SessionInfo> => ({ ok: false, error: new AppError(code, { reference: "req-1" }).toShape() });

function request(kind: PrivacyRequestKind, status: PrivacyRequestStatus = "received", memberId: string = MEMBER_A): PrivacyRequest {
  return { id: REQ, memberId, kind, status, createdAt: stamp, resolvedAt: null };
}

const zeroBalance: Balance = { memberId: MEMBER_A, currency: "NGN", ledgerKobo: 0, availableKobo: 0, heldKobo: 0 };

function harness(
  opts: {
    stored?: PrivacyRequest;
    balance?: Partial<Balance>;
    payoutStatuses?: string[];
    payoutAlwaysMore?: boolean;
    openRefund?: boolean;
    executor?: boolean;
    reauth?: Result<SessionInfo>;
    grants?: Partial<Record<PermissionName, Result<SessionInfo>>>;
    v11?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const store = new Map<string, PrivacyRequest>();
  if (opts.stored) {
    store.set(opts.stored.id, opts.stored);
  }
  const serverPrivacy = {
    getById: vi.fn(async (id: string) => store.get(id) ?? null),
    setStatus: vi.fn(async (id: string, from: PrivacyRequestStatus, to: PrivacyRequestStatus, _by: string) => {
      const current = store.get(id);
      if (!current || current.status !== from) {
        return null;
      }
      calls.push(`setStatus:${from}>${to}`);
      const next = { ...current, status: to };
      store.set(id, next);
      return next;
    }),
    listOpen: vi.fn(async () => ({ items: opts.stored ? [opts.stored] : [], nextCursor: null })),
  };
  if (opts.v11 === false) {
    delete (serverPrivacy as Partial<typeof serverPrivacy>).getById;
    delete (serverPrivacy as Partial<typeof serverPrivacy>).setStatus;
  }
  const ledger = { getBalance: vi.fn(async (): Promise<Balance> => ({ ...zeroBalance, ...opts.balance })) };
  const payouts = {
    listByMember: vi.fn(async () => ({
      items: (opts.payoutStatuses ?? []).map((status) => ({ status }) as PayoutRequest),
      nextCursor: opts.payoutAlwaysMore ? "more" : null,
    })),
  };
  const forSession = vi.fn(async () => ({}) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ privacyRequests: serverPrivacy, ledger, payouts }) as unknown as Repositories, forSession };
  const requirePermission = vi.fn(async (_ctx: RequestContext, permission: PermissionName, o?: { requireReauth?: boolean }) =>
    o?.requireReauth ? (opts.reauth ?? session(ADMIN, ["admin"])) : (opts.grants?.[permission] ?? failure("PERMISSION_DENIED")),
  );
  const executor: DeletionExecutor = {
    hasOpenRefund: vi.fn(async () => opts.openRefund === true),
    anonymize: vi.fn(async () => {
      calls.push("anonymize");
    }),
  };
  const record = vi.fn(async () => undefined);
  const onUnexpectedError = vi.fn();
  const service = createPrivacyService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    rateLimiter: { check: vi.fn(async () => ({ ok: true, value: { remaining: 2 } })) } as unknown as RateLimiter,
    audit: { record } as unknown as AuditService,
    ...(opts.executor === false ? {} : { deletion: executor }),
    onUnexpectedError,
  });
  return { service, serverPrivacy, ledger, payouts, executor, requirePermission, record, onUnexpectedError, calls, store };
}

const manage = { "admin.privacy.manage": session(ADMIN, ["admin"]) } as const;
const noteText = "Not enough information to verify the member.";

describe("decide: rejecting", () => {
  it("needs a reason", async () => {
    const h = harness({ grants: manage, stored: request("access") });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.fields?.note).toBeDefined();
    }
    expect(h.serverPrivacy.setStatus).not.toHaveBeenCalled();
  });

  it("moves through review to rejected under the staff id, and audits with the reason", async () => {
    const h = harness({ grants: manage, stored: request("access") });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: false, note: noteText });
    expect(result.ok && result.value.status).toBe("rejected");
    expect(h.calls).toEqual(["setStatus:received>in_review", "setStatus:in_review>rejected"]);
    expect(h.serverPrivacy.setStatus).toHaveBeenLastCalledWith(REQ, "in_review", "rejected", ADMIN);
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "privacy.request.decide", result: "success", detail: { kind: "access", approve: false, note: noteText } }));
    expect(h.executor.anonymize).not.toHaveBeenCalled();
  });

  it("does not need the password again to reject, even a deletion request", async () => {
    const h = harness({ grants: manage, stored: request("deletion"), reauth: failure("AUTH_REAUTH_REQUIRED") });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: false, note: noteText });
    expect(result.ok).toBe(true);
  });
});

describe("decide: guards", () => {
  it("stops at the permission check", async () => {
    const h = harness({ grants: {}, stored: request("access") });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    expect(h.serverPrivacy.getById).not.toHaveBeenCalled();
  });

  it.each([[{ requestId: "nope", approve: true }], [{ requestId: REQ, approve: "yes" }], [{ requestId: REQ }]])("rejects invalid input %#", async (input) => {
    const h = harness({ grants: manage, stored: request("access") });
    const result = await h.service.decide(ctx, input as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("reports not found for an unknown request", async () => {
    const h = harness({ grants: manage });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("nobody decides a request about their own account", async () => {
    const h = harness({ grants: manage, stored: request("access", "received", ADMIN) });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.serverPrivacy.setStatus).not.toHaveBeenCalled();
  });

  it.each([["completed"], ["rejected"]] as const)("refuses a request that is already %s", async (status) => {
    const h = harness({ grants: manage, stored: request("access", status) });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
    expect(h.serverPrivacy.setStatus).not.toHaveBeenCalled();
  });

  it("reports a conflict when someone else changed the request first", async () => {
    const h = harness({ grants: manage, stored: request("access") });
    h.serverPrivacy.setStatus.mockResolvedValueOnce(null);
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
  });

  it("fails closed with INTERNAL when the provider has no getById or setStatus", async () => {
    const h = harness({ grants: manage, stored: request("access"), v11: false });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
    }
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("decide: approving access, export and correction", () => {
  it.each([["access"], ["export"], ["correction"]] as const)("completes a %s request without touching the account", async (kind) => {
    const h = harness({ grants: manage, stored: request(kind) });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true, note: "Sent by email." });
    expect(result.ok && result.value.status).toBe("completed");
    expect(h.calls).toEqual(["setStatus:received>in_review", "setStatus:in_review>completed"]);
    expect(h.executor.anonymize).not.toHaveBeenCalled();
    expect(h.ledger.getBalance).not.toHaveBeenCalled();
  });

  it("works from a request that is already in review", async () => {
    const h = harness({ grants: manage, stored: request("access", "in_review") });
    const result = await h.service.decide(ctx, { requestId: REQ, approve: true });
    expect(result.ok).toBe(true);
    expect(h.calls).toEqual(["setStatus:in_review>completed"]);
  });
});

describe("decide: approving a deletion (interim rule, awaiting legal confirmation)", () => {
  const approve = { requestId: REQ, approve: true } as const;

  it("asks for the password again before anything changes", async () => {
    const h = harness({ grants: manage, stored: request("deletion"), reauth: failure("AUTH_REAUTH_REQUIRED") });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_REAUTH_REQUIRED");
    }
    expect(h.requirePermission).toHaveBeenLastCalledWith(ctx, "admin.privacy.manage", { requireReauth: true });
    expect(h.serverPrivacy.setStatus).not.toHaveBeenCalled();
    expect(h.ledger.getBalance).not.toHaveBeenCalled();
    expect(h.executor.anonymize).not.toHaveBeenCalled();
  });

  it("is refused, and stays in review, when anonymization is not set up", async () => {
    const h = harness({ grants: manage, stored: request("deletion"), executor: false });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.requestId).toContain("not set up");
    }
    expect(h.store.get(REQ)?.status).toBe("in_review");
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "failure", detail: expect.objectContaining({ reason: "deletion_not_configured" }) }));
  });

  it.each([
    ["a balance", { balance: { ledgerKobo: 500, availableKobo: 500 } }, "balance"],
    ["held money", { balance: { ledgerKobo: 500, availableKobo: 0, heldKobo: 500 } }, "balance"],
    ["an open withdrawal", { payoutStatuses: ["paid", "approved"] }, "withdrawal"],
    ["an open refund", { openRefund: true }, "refund"],
  ] as const)("is blocked by %s, stays in review and anonymizes nothing", async (_name, patch, word) => {
    const h = harness({ grants: manage, stored: request("deletion"), ...patch });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.requestId).toContain(word);
      expect(result.error.fields?.requestId).toContain("stays in review");
    }
    expect(h.store.get(REQ)?.status).toBe("in_review");
    expect(h.executor.anonymize).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ result: "denied" }));
  });

  it("lists every blocker at once", async () => {
    const h = harness({ grants: manage, stored: request("deletion"), balance: { ledgerKobo: 1, availableKobo: 1 }, payoutStatuses: ["requested"], openRefund: true });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.error.fields?.requestId ?? "";
      expect(text).toContain("balance");
      expect(text).toContain("withdrawal");
      expect(text).toContain("refund");
    }
  });

  it("treats a payout scan that runs out of pages as an open withdrawal", async () => {
    const h = harness({ grants: manage, stored: request("deletion"), payoutAlwaysMore: true });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    expect(h.payouts.listByMember).toHaveBeenCalledTimes(PAYOUT_SCAN_MAX_PAGES);
    expect(h.executor.anonymize).not.toHaveBeenCalled();
  });

  it("anonymizes before it marks the request completed, and audits success", async () => {
    const h = harness({ grants: manage, stored: request("deletion") });
    const result = await h.service.decide(ctx, approve);
    expect(result.ok && result.value.status).toBe("completed");
    expect(h.calls).toEqual(["setStatus:received>in_review", "anonymize", "setStatus:in_review>completed"]);
    expect(h.executor.anonymize).toHaveBeenCalledWith(ctx, MEMBER_A);
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "privacy.request.decide", result: "success" }));
  });

  it("never marks the request completed when anonymization fails", async () => {
    const h = harness({ grants: manage, stored: request("deletion") });
    (h.executor.anonymize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("identity store down password=hunter2"));
    const result = await h.service.decide(ctx, approve);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.store.get(REQ)?.status).toBe("in_review");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("if the last status step fails after the work, says so, and deciding again finishes the job", async () => {
    const h = harness({ grants: manage, stored: request("deletion") });
    h.serverPrivacy.setStatus.mockImplementationOnce(async (id: string, from: PrivacyRequestStatus, to: PrivacyRequestStatus) => {
      const current = h.store.get(id);
      if (!current || current.status !== from) return null;
      h.calls.push(`setStatus:${from}>${to}`);
      const next = { ...current, status: to };
      h.store.set(id, next);
      return next;
    });
    h.serverPrivacy.setStatus.mockResolvedValueOnce(null);
    const first = await h.service.decide(ctx, approve);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.fields?.requestId).toContain("work was done");
    }
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
    expect(h.store.get(REQ)?.status).toBe("in_review");

    const second = await h.service.decide(ctx, approve);
    expect(second.ok && second.value.status).toBe("completed");
    expect(h.executor.anonymize).toHaveBeenCalledTimes(2);
  });
});

describe("listOpen", () => {
  it("lists open requests for staff and passes the page on", async () => {
    const h = harness({ grants: manage, stored: request("access") });
    const result = await h.service.listOpen(ctx, { limit: 10, cursor: "c1" });
    expect(result.ok && result.value.items).toHaveLength(1);
    expect(h.serverPrivacy.listOpen).toHaveBeenCalledWith({ limit: 10, cursor: "c1" });
  });

  it("is denied without admin.privacy.manage", async () => {
    const h = harness({ grants: {}, stored: request("access") });
    const result = await h.service.listOpen(ctx, { limit: 10 });
    expect(result.ok).toBe(false);
    expect(h.serverPrivacy.listOpen).not.toHaveBeenCalled();
  });

  it("rejects an out of range page size", async () => {
    const h = harness({ grants: manage });
    const result = await h.service.listOpen(ctx, { limit: 1000 });
    expect(result.ok).toBe(false);
  });
});
