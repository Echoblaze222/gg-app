import { describe, expect, it, vi } from "vitest";
import type { PolicyAcceptance, PolicyVersion } from "../../contracts/entities";
import type { PolicyKind } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { EventBus } from "../../contracts/events";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { createPolicyService, latestPublished, publishedVersions } from "./policy-service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const MEMBER_B = "22222222-2222-4222-8222-222222222222";
const V_OLD = "33333333-3333-4333-8333-333333333333";
const V_NEW = "44444444-4444-4444-8444-444444444444";
const V_DRAFT = "55555555-5555-4555-8555-555555555555";
const V_FUTURE = "66666666-6666-4666-8666-666666666666";
const V_PRIVACY = "77777777-7777-4777-8777-777777777777";
const V_UNKNOWN = "88888888-8888-4888-8888-888888888888";
const ACC = "99999999-9999-4999-8999-999999999999";

const NOW = new Date("2026-11-14T12:00:00.000Z");
const ctx: RequestContext = { requestId: "req-1", actorId: MEMBER_B, ip: "203.0.113.9", userAgent: "ua" };
const session: SessionInfo = { memberId: MEMBER_A, roles: ["member"], recentlyReauthenticated: false, mfaVerified: false };

function version(overrides: Partial<PolicyVersion> = {}): PolicyVersion {
  return { id: V_OLD, kind: "terms", version: "1.0", body: "Terms text", draft: false, publishedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function acceptance(overrides: Partial<PolicyAcceptance> = {}): PolicyAcceptance {
  return { id: ACC, memberId: MEMBER_A, policyVersionId: V_NEW, acceptedAt: "2026-11-14T11:00:00.000Z", ip: "203.0.113.9", ...overrides };
}

const terms: PolicyVersion[] = [
  version({ id: V_OLD, version: "1.0", publishedAt: "2026-01-01T00:00:00.000Z" }),
  version({ id: V_NEW, version: "2.0", publishedAt: "2026-06-01T00:00:00.000Z" }),
  version({ id: V_DRAFT, version: "3.0", publishedAt: null }),
  version({ id: V_FUTURE, version: "4.0", publishedAt: "2027-01-01T00:00:00.000Z" }),
];

function harness(opts: { versions?: Partial<Record<PolicyKind, PolicyVersion[]>>; acceptances?: PolicyAcceptance[]; auth?: Result<SessionInfo> } = {}) {
  const byKind = opts.versions ?? { terms, privacy: [version({ id: V_PRIVACY, kind: "privacy", version: "1.0" })] };
  const serverPolicies = {
    listVersions: vi.fn(async (kind: PolicyKind) => byKind[kind] ?? []),
    accept: vi.fn(async (input: { memberId: string; policyVersionId: string; ip?: string | null }) =>
      acceptance({ memberId: input.memberId, policyVersionId: input.policyVersionId, ip: input.ip ?? null }),
    ),
  };
  const sessionPolicies = { listAcceptances: vi.fn(async () => opts.acceptances ?? []) };
  const forSession = vi.fn(async () => ({ policies: sessionPolicies }) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ policies: serverPolicies }) as unknown as Repositories, forSession };
  const requirePermission = vi.fn(async () => opts.auth ?? ({ ok: true, value: session } as Result<SessionInfo>));
  const record = vi.fn(async () => undefined);
  const publish = vi.fn(async () => undefined);
  const onUnexpectedError = vi.fn();
  const service = createPolicyService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    audit: { record } as unknown as AuditService,
    events: { publish } as unknown as EventBus,
    now: () => NOW,
    newEventId: () => "evt-1",
    newReference: () => "ref-1",
    onUnexpectedError,
  });
  return { service, serverPolicies, sessionPolicies, forSession, requirePermission, record, publish, onUnexpectedError };
}

describe("published version selection", () => {
  it("ignores unpublished, future dated and invalid dated versions", () => {
    const list = [...terms, version({ id: "x", publishedAt: "not-a-date" })];
    expect(publishedVersions(list, NOW.getTime()).map((v) => v.id)).toEqual([V_OLD, V_NEW]);
    expect(latestPublished(list, NOW.getTime())?.id).toBe(V_NEW);
  });

  it("picks the later entry when publish times are equal, and null when nothing is published", () => {
    const same = [version({ id: "a", publishedAt: "2026-01-01T00:00:00.000Z" }), version({ id: "b", publishedAt: "2026-01-01T00:00:00.000Z" })];
    expect(latestPublished(same, NOW.getTime())?.id).toBe("b");
    expect(latestPublished([version({ publishedAt: null })], NOW.getTime())).toBeNull();
    expect(latestPublished([], NOW.getTime())).toBeNull();
  });
});

describe("getCurrent", () => {
  it("returns the newest published version of the kind", async () => {
    const h = harness();
    const result = await h.service.getCurrent("terms");
    expect(result).toEqual({ ok: true, value: terms[1] });
    expect(h.serverPolicies.listVersions).toHaveBeenCalledWith("terms");
  });

  it("keeps the draft flag so the page can show the needs legal review marker", async () => {
    const h = harness({ versions: { terms: [version({ draft: true })] } });
    const result = await h.service.getCurrent("terms");
    expect(result.ok && result.value.draft).toBe(true);
  });

  it("reports not found with a reference when nothing is published", async () => {
    const h = harness({ versions: { terms: [version({ publishedAt: null })] } });
    const result = await h.service.getCurrent("terms");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.reference).toBe("ref-1");
    }
  });

  it("rejects an unknown kind without a lookup", async () => {
    const h = harness();
    const result = await h.service.getCurrent("cookies" as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.reference).toBe("ref-1");
    }
    expect(h.serverPolicies.listVersions).not.toHaveBeenCalled();
  });

  it("turns an unexpected error into INTERNAL with the reference", async () => {
    const h = harness();
    h.serverPolicies.listVersions.mockRejectedValueOnce(new Error("db password=hunter2"));
    const result = await h.service.getCurrent("terms");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("ref-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("accept", () => {
  it("records consent for the current version with a server supplied ip, audits and publishes", async () => {
    const h = harness();
    const result = await h.service.accept(ctx, { policyVersionId: V_NEW });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.profile.update");
    expect(h.serverPolicies.accept).toHaveBeenCalledWith({ memberId: MEMBER_A, policyVersionId: V_NEW, ip: "203.0.113.9" });
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "policy.accept", targetType: "policy_version", targetId: V_NEW, result: "success" }));
    expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "policy.accepted", data: { memberId: MEMBER_A, policyVersionId: V_NEW } }));
  });

  it("works for a version of another kind, judged against that kind's own latest", async () => {
    const h = harness();
    const result = await h.service.accept(ctx, { policyVersionId: V_PRIVACY });
    expect(result.ok).toBe(true);
    expect(h.serverPolicies.accept).toHaveBeenCalledTimes(1);
  });

  it("is a no-op returning the first acceptance when already accepted", async () => {
    const first = acceptance({ id: "first" });
    const h = harness({ acceptances: [first] });
    const result = await h.service.accept(ctx, { policyVersionId: V_NEW });
    expect(result).toEqual({ ok: true, value: first });
    expect(h.serverPolicies.accept).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("refuses an older version and says a newer one exists", async () => {
    const h = harness();
    const result = await h.service.accept(ctx, { policyVersionId: V_OLD });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.policyVersionId).toContain("newer version");
    }
    expect(h.serverPolicies.accept).not.toHaveBeenCalled();
  });

  it.each([[V_DRAFT], [V_FUTURE], [V_UNKNOWN]])("treats %s as not found", async (id) => {
    const h = harness();
    const result = await h.service.accept(ctx, { policyVersionId: id });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.serverPolicies.accept).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before any lookup", async () => {
    const h = harness();
    const result = await h.service.accept(ctx, { policyVersionId: "nope" });
    expect(result.ok).toBe(false);
    expect(h.serverPolicies.listVersions).not.toHaveBeenCalled();
  });

  it("stops at the permission check", async () => {
    const denied: Result<SessionInfo> = { ok: false, error: new AppError("PERMISSION_DENIED", { reference: "req-1" }).toShape() };
    const h = harness({ auth: denied });
    const result = await h.service.accept(ctx, { policyVersionId: V_NEW });
    expect(result.ok).toBe(false);
    expect(h.forSession).not.toHaveBeenCalled();
    expect(h.serverPolicies.listVersions).not.toHaveBeenCalled();
  });

  it("still succeeds when the audit write fails, and reports it", async () => {
    const h = harness();
    const boom = new Error("audit down");
    h.record.mockRejectedValueOnce(boom);
    const result = await h.service.accept(ctx, { policyVersionId: V_NEW });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledWith(boom, "req-1");
  });
});

describe("listAcceptances", () => {
  it("lists for the verified member", async () => {
    const mine = [acceptance()];
    const h = harness({ acceptances: mine });
    const result = await h.service.listAcceptances(ctx);
    expect(result).toEqual({ ok: true, value: mine });
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.profile.read");
    expect(h.sessionPolicies.listAcceptances).toHaveBeenCalledWith(MEMBER_A);
  });
});
