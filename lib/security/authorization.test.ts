// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAuthorizationService } from "./authorization";
import { createAuditService } from "./audit";
import { fakeAuditRepo, fakeLogger, fakeMembers, fakeResolver, fakeRoles, makeCtx, MEMBER_ID, throwingResolver } from "@/tests/security/fakes";
import type { SessionFacts } from "./types";
import type { Role, MemberStatus } from "@/contracts/enums";

const goodFacts: SessionFacts = { memberId: MEMBER_ID, mfaVerified: false, recentlyReauthenticated: false };

function build(opts: { facts?: SessionFacts | null; roles?: Role[]; status?: MemberStatus | null; rolesFail?: boolean; resolverThrows?: boolean } = {}) {
  const auditRepo = fakeAuditRepo();
  const audit = createAuditService({ audit: auditRepo, logger: fakeLogger() });
  const svc = createAuthorizationService({
    sessions: opts.resolverThrows ? throwingResolver() : fakeResolver("facts" in opts ? (opts.facts ?? null) : goodFacts),
    members: fakeMembers("status" in opts ? (opts.status ?? null) : "active"),
    roles: fakeRoles(opts.roles ?? ["member"], { fail: opts.rolesFail }),
    audit,
  });
  return { svc, auditRepo };
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

describe("requirePermission", () => {
  it("allows a member their own permission", async () => {
    const { svc } = build();
    const r = await svc.requirePermission(makeCtx(), "member.profile.read");
    expect(r.ok && r.value).toMatchObject({ memberId: MEMBER_ID, roles: ["member"], mfaVerified: false });
  });
  it("T5: a member asking for an admin permission is denied and audited", async () => {
    const { svc, auditRepo } = build();
    const r = await svc.requirePermission(makeCtx(), "admin.members.read");
    expect(code(r)).toBe("PERMISSION_DENIED");
    expect(auditRepo.rows[0]).toMatchObject({ action: "authz.denied", result: "denied", targetId: "admin.members.read" });
  });
  it("no verified session gives AUTH_SESSION_EXPIRED", async () => {
    expect(code(await build({ facts: null }).svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_SESSION_EXPIRED");
  });
  it("a session whose member no longer exists gives the same code (no existence leak)", async () => {
    expect(code(await build({ status: null }).svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_SESSION_EXPIRED");
  });
  it("suspended and closed members are refused even with a valid token", async () => {
    expect(code(await build({ status: "suspended" }).svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_ACCOUNT_SUSPENDED");
    expect(code(await build({ status: "closed" }).svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_ACCOUNT_SUSPENDED");
  });
  it("unverified email gives AUTH_EMAIL_NOT_VERIFIED", async () => {
    expect(code(await build({ status: "pending_verification" }).svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_EMAIL_NOT_VERIFIED");
  });
  it("T12: a privileged role without MFA is refused for every permission", async () => {
    const { svc } = build({ roles: ["owner"] });
    expect(code(await svc.requirePermission(makeCtx(), "admin.members.read"))).toBe("AUTH_MFA_REQUIRED");
    expect(code(await svc.requirePermission(makeCtx(), "member.profile.read"))).toBe("AUTH_MFA_REQUIRED");
  });
  it("a privileged role with MFA is allowed", async () => {
    const { svc } = build({ roles: ["admin"], facts: { ...goodFacts, mfaVerified: true } });
    expect(code(await svc.requirePermission(makeCtx(), "admin.members.read"))).toBe("OK");
  });
  it("a caller without the permission does not learn about MFA state", async () => {
    const { svc } = build({ roles: ["support"] });
    expect(code(await svc.requirePermission(makeCtx(), "admin.payments.refund"))).toBe("PERMISSION_DENIED");
  });
  it("reauth is required for listed permissions even with MFA", async () => {
    const { svc } = build({ roles: ["owner"], facts: { ...goodFacts, mfaVerified: true } });
    expect(code(await svc.requirePermission(makeCtx(), "admin.payments.refund"))).toBe("AUTH_REAUTH_REQUIRED");
  });
  it("reauth satisfied lets the action through", async () => {
    const { svc } = build({ roles: ["owner"], facts: { memberId: MEMBER_ID, mfaVerified: true, recentlyReauthenticated: true } });
    expect(code(await svc.requirePermission(makeCtx(), "admin.payments.refund"))).toBe("OK");
  });
  it("opts.requireReauth forces reauth on any permission", async () => {
    const { svc } = build();
    expect(code(await svc.requirePermission(makeCtx(), "member.profile.read", { requireReauth: true }))).toBe("AUTH_REAUTH_REQUIRED");
  });
  it("an unknown permission string is denied", async () => {
    const { svc } = build({ roles: ["owner"], facts: { ...goodFacts, mfaVerified: true } });
    expect(code(await svc.requirePermission(makeCtx(), "admin.everything" as never))).toBe("PERMISSION_DENIED");
  });
  it("denies a permission string that is not in the contract, even if the store returns it", async () => {
    const roles = { ...fakeRoles(["owner"]), listPermissions: async () => ["admin.everything"] };
    const svc = createAuthorizationService({
      sessions: fakeResolver({ ...goodFacts, mfaVerified: true }),
      members: fakeMembers("active"),
      roles,
      audit: createAuditService({ audit: fakeAuditRepo(), logger: fakeLogger() }),
    });
    expect(code(await svc.requirePermission(makeCtx(), "admin.everything" as never))).toBe("PERMISSION_DENIED");
  });
  it("fails closed with INTERNAL when the role store is down", async () => {
    const r = await build({ rolesFail: true }).svc.requirePermission(makeCtx(), "member.profile.read");
    expect(code(r)).toBe("INTERNAL");
  });
  it("fails closed when the session store throws, and never throws itself", async () => {
    const r = await build({ resolverThrows: true }).svc.requirePermission(makeCtx(), "member.profile.read");
    expect(code(r)).toBe("INTERNAL");
  });
  it("uses the request id as the error reference", async () => {
    const r = await build({ facts: null }).svc.requirePermission(makeCtx({ requestId: "req_abc" }), "member.profile.read");
    expect(!r.ok && r.error.reference).toBe("req_abc");
  });
});

describe("grantRole and revokeRole", () => {
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const ownerFacts: SessionFacts = { memberId: MEMBER_ID, mfaVerified: true, recentlyReauthenticated: true };

  function buildOwner(o: { facts?: SessionFacts; auditFails?: boolean; writesFail?: boolean; roles?: Role[] } = {}) {
    const auditRepo = fakeAuditRepo({ fail: o.auditFails });
    const roles = fakeRoles(o.roles ?? ["owner"], { failWrites: o.writesFail });
    const svc = createAuthorizationService({
      sessions: fakeResolver(o.facts ?? ownerFacts),
      members: fakeMembers("active"),
      roles,
      audit: createAuditService({ audit: auditRepo, logger: fakeLogger() }),
    });
    return { svc, roles, auditRepo };
  }

  it("owner with MFA and fresh reauth can grant a role, and an audit row exists first", async () => {
    const { svc, roles, auditRepo } = buildOwner();
    const r = await svc.grantRole(makeCtx(), { memberId: OTHER, role: "support" });
    expect(r.ok).toBe(true);
    expect(roles.granted).toHaveLength(1);
    expect(auditRepo.rows[0]).toMatchObject({ action: "role.grant", targetId: OTHER });
  });
  it("owner can revoke a role", async () => {
    const { svc, roles } = buildOwner();
    expect((await svc.revokeRole(makeCtx(), { memberId: OTHER, role: "support" })).ok).toBe(true);
    expect(roles.revoked).toHaveLength(1);
  });
  it("a member cannot grant roles", async () => {
    const { svc, roles } = buildOwner({ roles: ["member"], facts: { ...ownerFacts, mfaVerified: false } });
    const r = await svc.grantRole(makeCtx(), { memberId: OTHER, role: "owner" });
    expect(code(r)).toBe("PERMISSION_DENIED");
    expect(roles.granted).toHaveLength(0);
  });
  it("an admin cannot grant roles (admin.roles.manage is owner only)", async () => {
    const { svc, roles } = buildOwner({ roles: ["admin"] });
    expect(code(await svc.grantRole(makeCtx(), { memberId: OTHER, role: "admin" }))).toBe("PERMISSION_DENIED");
    expect(roles.granted).toHaveLength(0);
  });
  it("owner without recent reauth is asked to confirm the password", async () => {
    const { svc, roles } = buildOwner({ facts: { ...ownerFacts, recentlyReauthenticated: false } });
    expect(code(await svc.grantRole(makeCtx(), { memberId: OTHER, role: "support" }))).toBe("AUTH_REAUTH_REQUIRED");
    expect(roles.granted).toHaveLength(0);
  });
  it("nobody changes their own roles", async () => {
    const { svc, roles } = buildOwner();
    expect(code(await svc.revokeRole(makeCtx(), { memberId: MEMBER_ID, role: "owner" }))).toBe("PERMISSION_DENIED");
    expect(code(await svc.grantRole(makeCtx(), { memberId: MEMBER_ID, role: "admin" }))).toBe("PERMISSION_DENIED");
    expect(roles.granted).toHaveLength(0);
    expect(roles.revoked).toHaveLength(0);
  });
  it("fails closed: if the audit row cannot be written, no role changes", async () => {
    const { svc, roles } = buildOwner({ auditFails: true });
    expect(code(await svc.grantRole(makeCtx(), { memberId: OTHER, role: "support" }))).toBe("INTERNAL");
    expect(roles.granted).toHaveLength(0);
  });
  it("a failed write returns INTERNAL and records a failure row", async () => {
    const { svc, auditRepo } = buildOwner({ writesFail: true });
    expect(code(await svc.grantRole(makeCtx(), { memberId: OTHER, role: "support" }))).toBe("INTERNAL");
    expect(auditRepo.rows.at(-1)).toMatchObject({ action: "role.grant", result: "failure" });
  });
  it("rejects an unknown role name", async () => {
    const { svc, roles } = buildOwner();
    expect(code(await svc.grantRole(makeCtx(), { memberId: OTHER, role: "superuser" as never }))).toBe("VALIDATION_FAILED");
    expect(roles.granted).toHaveLength(0);
  });
});
