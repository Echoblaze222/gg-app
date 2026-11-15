import { describe, expect, it, vi } from "vitest";
import type { PolicyAcceptance, PolicyVersion } from "../../contracts/entities";
import type { PolicyKind, Role } from "../../contracts/enums";
import { AppError, type Result } from "../../contracts/errors";
import type { PermissionName } from "../../contracts/permissions";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { createPolicyService } from "./policy-service";

// All fakes live in this test file only. Nothing here is imported by production code.

const MEMBER_A = "11111111-1111-4111-8111-111111111111";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const V_OLD = "33333333-3333-4333-8333-333333333333";
const V_NEW = "44444444-4444-4444-8444-444444444444";
const V_PRIVACY = "77777777-7777-4777-8777-777777777777";
const V_DRAFT_PUBLISHED = "88888888-8888-4888-8888-888888888888";
const V_UNPUBLISHED = "99999999-9999-4999-8999-999999999999";
const CREATED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const NOW = new Date("2026-11-14T12:00:00.000Z");
const ctx: RequestContext = { requestId: "req-1", actorId: ADMIN, ip: "203.0.113.9", userAgent: "ua" };

const session = (memberId: string, roles: Role[]): Result<SessionInfo> => ({ ok: true, value: { memberId, roles, recentlyReauthenticated: true, mfaVerified: true } });
const failure = (code: "PERMISSION_DENIED" | "AUTH_REAUTH_REQUIRED"): Result<SessionInfo> => ({ ok: false, error: new AppError(code, { reference: "req-1" }).toShape() });

function version(overrides: Partial<PolicyVersion> = {}): PolicyVersion {
  return { id: V_OLD, kind: "terms", version: "1.0", body: "Terms text", draft: false, publishedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function acceptance(policyVersionId: string): PolicyAcceptance {
  return { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", memberId: MEMBER_A, policyVersionId, acceptedAt: "2026-11-14T11:00:00.000Z", ip: null };
}

const defaultVersions: Partial<Record<PolicyKind, PolicyVersion[]>> = {
  terms: [version({ id: V_OLD, version: "1.0" }), version({ id: V_NEW, version: "2.0", publishedAt: "2026-06-01T00:00:00.000Z" })],
  privacy: [version({ id: V_PRIVACY, kind: "privacy", version: "1.0" })],
  payment_terms: [version({ id: V_UNPUBLISHED, kind: "payment_terms", publishedAt: null })],
};

const longBody = "This is the full policy text and it is long enough.";

function harness(opts: { versions?: Partial<Record<PolicyKind, PolicyVersion[]>>; acceptances?: PolicyAcceptance[]; grants?: Partial<Record<PermissionName, Result<SessionInfo>>>; reauth?: Result<SessionInfo>; v11?: boolean } = {}) {
  const byKind = opts.versions ?? defaultVersions;
  const serverPolicies = {
    listVersions: vi.fn(async (kind: PolicyKind) => byKind[kind] ?? []),
    publish: vi.fn(async (input: { kind: PolicyKind; version: string; body: string; draft: boolean; publishedBy: string }): Promise<PolicyVersion> =>
      version({ id: CREATED, kind: input.kind, version: input.version, body: input.body, draft: input.draft, publishedAt: "2026-11-14T12:00:00.000Z" }),
    ),
  };
  if (opts.v11 === false) {
    delete (serverPolicies as Partial<typeof serverPolicies>).publish;
  }
  const sessionPolicies = { listAcceptances: vi.fn(async () => opts.acceptances ?? []) };
  const forSession = vi.fn(async () => ({ policies: sessionPolicies }) as unknown as Repositories);
  const provider: RepositoryProvider = { server: () => ({ policies: serverPolicies }) as unknown as Repositories, forSession };
  const requirePermission = vi.fn(async (_ctx: RequestContext, permission: PermissionName, o?: { requireReauth?: boolean }) =>
    o?.requireReauth ? (opts.reauth ?? session(ADMIN, ["admin"])) : (opts.grants?.[permission] ?? failure("PERMISSION_DENIED")),
  );
  const record = vi.fn(async () => undefined);
  const onUnexpectedError = vi.fn();
  const service = createPolicyService({
    repositories: provider,
    authorization: { requirePermission } as unknown as AuthorizationService,
    audit: { record } as unknown as AuditService,
    now: () => NOW,
    newReference: () => "ref-1",
    onUnexpectedError,
  });
  return { service, serverPolicies, sessionPolicies, requirePermission, record, onUnexpectedError };
}

const memberRead = { "member.profile.read": session(MEMBER_A, ["member"]) } as const;
const adminManage = { "admin.policies.manage": session(ADMIN, ["admin"]) } as const;
const ownerManage = { "admin.policies.manage": session(OWNER, ["owner"]) } as const;

describe("listUnaccepted", () => {
  it("returns the current version of each kind that the member has not accepted, in policy kind order", async () => {
    const h = harness({ grants: memberRead });
    const result = await h.service.listUnaccepted(ctx);
    expect(result.ok && result.value.map((v) => v.id)).toEqual([V_NEW, V_PRIVACY]);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.profile.read");
  });

  it("leaves out a kind whose current version is already accepted, and ignores unpublished versions", async () => {
    const h = harness({ grants: memberRead, acceptances: [acceptance(V_NEW)] });
    const result = await h.service.listUnaccepted(ctx);
    expect(result.ok && result.value.map((v) => v.id)).toEqual([V_PRIVACY]);
  });

  it("an acceptance of an older version does not count as accepting the current one", async () => {
    const h = harness({ grants: memberRead, acceptances: [acceptance(V_OLD)] });
    const result = await h.service.listUnaccepted(ctx);
    expect(result.ok && result.value.map((v) => v.id)).toContain(V_NEW);
  });

  it("includes a published draft, so members accept it before launch", async () => {
    const h = harness({ grants: memberRead, versions: { refund: [version({ id: V_DRAFT_PUBLISHED, kind: "refund", draft: true })] } });
    const result = await h.service.listUnaccepted(ctx);
    expect(result.ok && result.value).toEqual([expect.objectContaining({ id: V_DRAFT_PUBLISHED, draft: true })]);
  });

  it("returns an empty list when everything is accepted, and stops at the permission check otherwise", async () => {
    const done = harness({ grants: memberRead, acceptances: [acceptance(V_NEW), acceptance(V_PRIVACY)] });
    expect(await done.service.listUnaccepted(ctx)).toEqual({ ok: true, value: [] });
    const denied = harness({ grants: {} });
    const result = await denied.service.listUnaccepted(ctx);
    expect(result.ok).toBe(false);
    expect(denied.serverPolicies.listVersions).not.toHaveBeenCalled();
  });
});

describe("publish", () => {
  const input = { kind: "terms", version: "3.0", body: longBody, draft: true } as const;

  it("publishes a draft as an admin, records the publisher from the session, and audits", async () => {
    const h = harness({ grants: adminManage });
    const result = await h.service.publish(ctx, input);
    expect(result.ok && result.value.id).toBe(CREATED);
    expect(h.serverPolicies.publish).toHaveBeenCalledWith({ kind: "terms", version: "3.0", body: longBody, draft: true, publishedBy: ADMIN });
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "policy.publish", targetId: CREATED, detail: { kind: "terms", version: "3.0", draft: true } }));
  });

  it("only the owner can publish a version as legally reviewed", async () => {
    const asAdmin = harness({ grants: adminManage });
    const denied = await asAdmin.service.publish(ctx, { ...input, draft: false });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("PERMISSION_DENIED");
      expect(denied.error.fields?.draft).toBeDefined();
    }
    expect(asAdmin.serverPolicies.publish).not.toHaveBeenCalled();

    const asOwner = harness({ grants: ownerManage });
    const allowed = await asOwner.service.publish(ctx, { ...input, draft: false });
    expect(allowed.ok).toBe(true);
    expect(asOwner.serverPolicies.publish).toHaveBeenCalledWith(expect.objectContaining({ draft: false, publishedBy: OWNER }));
  });

  it("requires the password to be confirmed again, and does nothing before that", async () => {
    const h = harness({ grants: adminManage, reauth: failure("AUTH_REAUTH_REQUIRED") });
    const result = await h.service.publish(ctx, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_REAUTH_REQUIRED");
    }
    expect(h.requirePermission).toHaveBeenLastCalledWith(ctx, "admin.policies.manage", { requireReauth: true });
    expect(h.serverPolicies.listVersions).not.toHaveBeenCalled();
    expect(h.serverPolicies.publish).not.toHaveBeenCalled();
  });

  it("refuses a version name that already exists for that kind", async () => {
    const h = harness({ grants: adminManage });
    const result = await h.service.publish(ctx, { ...input, version: "2.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
      expect(result.error.fields?.version).toBeDefined();
    }
    expect(h.serverPolicies.publish).not.toHaveBeenCalled();
  });

  it("the same version name is fine for a different kind", async () => {
    const h = harness({ grants: adminManage });
    const result = await h.service.publish(ctx, { ...input, kind: "refund", version: "1.0" });
    expect(result.ok).toBe(true);
  });

  it.each([
    [{ ...input, version: "" }],
    [{ ...input, version: "bad version!" }],
    [{ ...input, version: "-starts-with-dash" }],
    [{ ...input, version: "v".repeat(33) }],
    [{ ...input, body: "too short" }],
    [{ ...input, body: `${longBody}\u0000` }],
    [{ ...input, kind: "cookies" }],
    [{ ...input, draft: "yes" }],
  ])("rejects invalid input %#, before asking for the password again", async (bad) => {
    const h = harness({ grants: adminManage });
    const result = await h.service.publish(ctx, bad as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.requirePermission).toHaveBeenCalledTimes(1);
    expect(h.serverPolicies.publish).not.toHaveBeenCalled();
  });

  it("stops at the permission check", async () => {
    const h = harness({ grants: memberRead });
    const result = await h.service.publish(ctx, input);
    expect(result.ok).toBe(false);
    expect(h.serverPolicies.publish).not.toHaveBeenCalled();
  });

  it("fails closed with INTERNAL when the provider has no publish", async () => {
    const h = harness({ grants: adminManage, v11: false });
    const result = await h.service.publish(ctx, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});
