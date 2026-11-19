// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAuthService } from "./service";
import { createAuditService } from "@/lib/security/audit";
import { createAuthorizationService } from "@/lib/security/authorization";
import { createRateLimiter } from "@/lib/security/rate-limit";
import type { SessionFacts } from "@/lib/security/types";
import type { Role, MemberStatus } from "@/contracts/enums";
import { fakeAuditRepo, fakeLogger, fakeMembers, fakeRateRepo, fakeResolver, fakeRoles, fakeSecurityEvents, makeCtx, MEMBER_ID } from "@/tests/security/fakes";
import { fakeDevices, fakeIdentity, fakePolicies, fakeReauth, PRIVACY_ID, TERMS_ID, type FakeIdentity } from "@/tests/security/auth-fakes";
import type { DeviceRecord } from "./types";

const SECRET = "s".repeat(48);
const goodReg = { fullName: "Chidi Eze", email: "Chidi@Example.com ", password: "plum-river-kettle-47", acceptedPolicyVersionIds: [TERMS_ID, PRIVACY_ID] };
const loginInput = { identifier: "chidi@example.com", password: "whatever-pass-1" };
const session: SessionFacts = { memberId: MEMBER_ID, sessionId: "sess-1", mfaVerified: false, recentlyReauthenticated: false };

interface Opts {
  identity?: Partial<FakeIdentity["config"]>;
  status?: MemberStatus | null;
  roles?: Role[];
  facts?: SessionFacts | null;
  policies?: { published?: boolean; acceptFails?: boolean };
  devices?: DeviceRecord[];
}

function build(o: Opts = {}) {
  const identity = fakeIdentity(o.identity);
  const auditRepo = fakeAuditRepo();
  const logger = fakeLogger();
  const audit = createAuditService({ audit: auditRepo, logger });
  const events = fakeSecurityEvents();
  const limits = fakeRateRepo();
  const limiter = createRateLimiter({ limits, events, hmacSecret: SECRET, logger });
  const roles = fakeRoles(o.roles ?? ["member"]);
  const members = fakeMembers("status" in o ? (o.status ?? null) : "active");
  const sessions = fakeResolver("facts" in o ? (o.facts ?? null) : session);
  const authorization = createAuthorizationService({ sessions, members, roles, audit, logger });
  const policies = fakePolicies(o.policies);
  const devices = fakeDevices(o.devices);
  const reauth = fakeReauth();
  const svc = createAuthService({ identity, sessions, members, roles, policies, limiter, authorization, audit, events, devices, reauth, hmacSecret: SECRET, logger });
  return { svc, identity, auditRepo, events, policies, devices, reauth, logger, limits };
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

describe("register", () => {
  it("creates the account, normalises the email and records policy acceptance", async () => {
    const { svc, identity, policies, auditRepo } = build();
    const r = await svc.register(makeCtx({ actorId: null }), goodReg);
    expect(r).toMatchObject({ ok: true, value: { memberId: MEMBER_ID, verificationSent: true } });
    expect(identity.calls).toContain("signUp");
    expect(policies.accepted.sort()).toEqual([PRIVACY_ID, TERMS_ID].sort());
    expect(auditRepo.rows.some((x) => x.action === "auth.register" && x.result === "success")).toBe(true);
  });
  it("A1 an already registered email gets the same success shape, with an id that is not the real one", async () => {
    const { svc, policies } = build({ identity: { alreadyRegistered: true } });
    const r = await svc.register(makeCtx({ actorId: null }), goodReg);
    expect(r.ok && r.value.verificationSent).toBe(true);
    expect(r.ok && r.value.memberId).not.toBe(MEMBER_ID);
    expect(policies.accepted).toHaveLength(0);
  });
  it("A2 rejects weak passwords", async () => {
    const { svc, identity } = build();
    expect(code(await svc.register(makeCtx({ actorId: null }), { ...goodReg, password: "Password123" }))).toBe("AUTH_PASSWORD_WEAK");
    expect(code(await svc.register(makeCtx({ actorId: null }), { ...goodReg, password: "xx-chidi-xx-1234" }))).toBe("AUTH_PASSWORD_WEAK");
    expect(identity.calls).not.toContain("signUp");
  });
  it("A3 requires the latest terms and privacy to be accepted", async () => {
    const { svc, identity } = build();
    const r = await svc.register(makeCtx({ actorId: null }), { ...goodReg, acceptedPolicyVersionIds: [TERMS_ID] });
    expect(code(r)).toBe("VALIDATION_FAILED");
    expect(identity.calls).not.toContain("signUp");
  });
  it("refuses registration when no policy is published (fail closed)", async () => {
    const { svc, identity, logger } = build({ policies: { published: false } });
    expect(code(await svc.register(makeCtx({ actorId: null }), goodReg))).toBe("SYSTEM_UNAVAILABLE");
    expect(identity.calls).not.toContain("signUp");
    expect(logger.errors.length).toBeGreaterThan(0);
  });
  it("A4 limits repeated registrations for the same email", async () => {
    const { svc } = build();
    for (let i = 0; i < 3; i++) await svc.register(makeCtx({ actorId: null }), goodReg);
    expect(code(await svc.register(makeCtx({ actorId: null }), goodReg))).toBe("RATE_LIMITED");
  });
  it("rejects a bad email and a bad phone with field names only", async () => {
    const { svc } = build();
    const r = await svc.register(makeCtx({ actorId: null }), { ...goodReg, email: "not-an-email", phone: "123" });
    expect(!r.ok && Object.keys(r.error.fields ?? {}).sort()).toEqual(["email", "phone"]);
  });
  it("registration still succeeds when the acceptance write fails, and the failure is audited", async () => {
    const { svc, auditRepo } = build({ policies: { acceptFails: true } });
    expect(code(await svc.register(makeCtx({ actorId: null }), goodReg))).toBe("OK");
    expect(auditRepo.rows.some((x) => x.action === "auth.register_policy_accept" && x.result === "failure")).toBe(true);
  });
});

describe("login", () => {
  it("signs in and records a security event", async () => {
    const { svc, events } = build();
    const r = await svc.login(makeCtx({ actorId: null }), loginInput);
    expect(r).toEqual({ ok: true, value: { mfaRequired: false } });
    expect(events.events.some((e) => e.type === "login_succeeded")).toBe(true);
  });
  it("A5 wrong password and unknown email give the same error", async () => {
    const { svc, events } = build({ identity: { signIn: { status: "invalid_credentials" } } });
    const a = await svc.login(makeCtx({ actorId: null }), loginInput);
    const b = await svc.login(makeCtx({ actorId: null }), { identifier: "nobody@example.com", password: "x".repeat(12) });
    expect(code(a)).toBe("AUTH_INVALID_CREDENTIALS");
    expect(code(b)).toBe("AUTH_INVALID_CREDENTIALS");
    expect(events.events.filter((e) => e.type === "login_failed")).toHaveLength(2);
  });
  it("malformed identifiers fail the same way without calling the provider", async () => {
    const { svc, identity } = build();
    expect(code(await svc.login(makeCtx({ actorId: null }), { identifier: "<script>", password: "abc" }))).toBe("AUTH_INVALID_CREDENTIALS");
    expect(identity.calls).not.toContain("signIn");
  });
  it("A6 lockout is identical for a real and an unknown email", async () => {
    const real = build({ identity: { signIn: { status: "invalid_credentials" } } });
    const unknown = build({ identity: { signIn: { status: "invalid_credentials" } } });
    const results: string[][] = [[], []];
    for (let i = 0; i < 12; i++) {
      results[0].push(code(await real.svc.login(makeCtx({ actorId: null, ip: `203.0.113.${i}` }), loginInput)));
      results[1].push(code(await unknown.svc.login(makeCtx({ actorId: null, ip: `203.0.113.${i}` }), { identifier: "ghost@example.com", password: "nope-nope-12" })));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0].at(-1)).toBe("AUTH_ACCOUNT_LOCKED");
    expect(results[0][0]).toBe("AUTH_INVALID_CREDENTIALS");
  });
  it("many different people behind one shared address are not locked out", async () => {
    const { svc } = build();
    for (let i = 0; i < 40; i++) {
      const r = await svc.login(makeCtx({ actorId: null }), { identifier: `user${i}@example.com`, password: "some-password-1" });
      expect(code(r)).toBe("OK");
    }
  });
  it("A7 a suspended account is signed out again and refused", async () => {
    const { svc, identity } = build({ status: "suspended" });
    expect(code(await svc.login(makeCtx({ actorId: null }), loginInput))).toBe("AUTH_ACCOUNT_SUSPENDED");
    expect(identity.calls).toContain("signOut");
  });
  it("A8 privileged roles are always sent to MFA", async () => {
    const { svc } = build({ roles: ["owner"] });
    expect(await svc.login(makeCtx({ actorId: null }), loginInput)).toEqual({ ok: true, value: { mfaRequired: true } });
  });
  it("a member with a second factor is sent to MFA", async () => {
    const { svc } = build({ identity: { signIn: { status: "ok", userId: MEMBER_ID, mfaEnrolled: true } } });
    expect(await svc.login(makeCtx({ actorId: null }), loginInput)).toEqual({ ok: true, value: { mfaRequired: true } });
  });
  it("A9 unverified email is reported", async () => {
    const { svc } = build({ identity: { signIn: { status: "email_not_verified" } } });
    expect(code(await svc.login(makeCtx({ actorId: null }), loginInput))).toBe("AUTH_EMAIL_NOT_VERIFIED");
  });
  it("A10 a provider outage gives a safe error with no provider text", async () => {
    const { svc, logger } = build({ identity: { throwOn: "signIn" } });
    const r = await svc.login(makeCtx({ actorId: null }), loginInput);
    expect(code(r)).toBe("SYSTEM_UNAVAILABLE");
    expect(JSON.stringify(r)).not.toContain("secret detail");
    expect(JSON.stringify(logger.errors)).not.toContain("secret detail");
  });
  it("a missing profile row after a valid sign in ends the session and fails generically", async () => {
    const { svc, identity } = build({ status: null });
    expect(code(await svc.login(makeCtx({ actorId: null }), loginInput))).toBe("AUTH_INVALID_CREDENTIALS");
    expect(identity.calls).toContain("signOut");
  });
});

describe("verifyMfa", () => {
  it("accepts a correct code", async () => {
    const { svc } = build();
    expect(code(await svc.verifyMfa(makeCtx(), { code: "123456" }))).toBe("OK");
  });
  it("needs a session", async () => {
    const { svc, identity } = build({ facts: null });
    expect(code(await svc.verifyMfa(makeCtx(), { code: "123456" }))).toBe("AUTH_SESSION_EXPIRED");
    expect(identity.calls).not.toContain("verifyTotp");
  });
  it("rejects a wrong code and records mfa_failed", async () => {
    const { svc, events } = build({ identity: { totpOk: false } });
    expect(code(await svc.verifyMfa(makeCtx(), { code: "123456" }))).toBe("AUTH_MFA_INVALID");
    expect(events.events.some((e) => e.type === "mfa_failed")).toBe(true);
  });
  it("rejects a badly shaped code without calling the provider", async () => {
    const { svc, identity } = build();
    expect(code(await svc.verifyMfa(makeCtx(), { code: "12ab56" }))).toBe("AUTH_MFA_INVALID");
    expect(identity.calls).not.toContain("verifyTotp");
  });
  it("A11 stops guessing after five attempts", async () => {
    const { svc } = build({ identity: { totpOk: false } });
    const out: string[] = [];
    for (let i = 0; i < 7; i++) out.push(code(await svc.verifyMfa(makeCtx(), { code: "000000" })));
    expect(out.slice(0, 5).every((c) => c === "AUTH_MFA_INVALID")).toBe(true);
    expect(out[6]).toBe("RATE_LIMITED");
  });
});

describe("logout and session", () => {
  it("logout always succeeds and ends the session", async () => {
    const { svc, identity } = build({ facts: null });
    expect(code(await svc.logout(makeCtx()))).toBe("OK");
    expect(identity.calls).toContain("signOut");
  });
  it("getSession returns roles and flags, or session expired", async () => {
    const ok = await build({ roles: ["member"] }).svc.getSession(makeCtx());
    expect(ok.ok && ok.value).toMatchObject({ memberId: MEMBER_ID, roles: ["member"], mfaVerified: false });
    expect(code(await build({ facts: null }).svc.getSession(makeCtx()))).toBe("AUTH_SESSION_EXPIRED");
  });
});

describe("password reset", () => {
  it("A12 request always succeeds, even for unknown emails and provider failures", async () => {
    expect(code(await build().svc.requestPasswordReset(makeCtx({ actorId: null }), { identifier: "ghost@example.com" }))).toBe("OK");
    expect(code(await build({ identity: { throwOn: "requestPasswordReset" } }).svc.requestPasswordReset(makeCtx({ actorId: null }), { identifier: "x@example.com" }))).toBe("OK");
    expect(code(await build().svc.requestPasswordReset(makeCtx({ actorId: null }), { identifier: "<bad>" }))).toBe("OK");
  });
  it("request does not call the provider for malformed emails", async () => {
    const { svc, identity } = build();
    await svc.requestPasswordReset(makeCtx({ actorId: null }), { identifier: "<bad>" });
    expect(identity.calls).not.toContain("requestPasswordReset");
  });
  it("confirm rejects weak passwords before touching the token", async () => {
    const { svc, identity } = build();
    expect(code(await svc.resetPassword(makeCtx({ actorId: null }), { token: "t".repeat(20), newPassword: "Password123" }))).toBe("AUTH_PASSWORD_WEAK");
    expect(identity.calls).not.toContain("resetPassword");
  });
  it("A12 an invalid or used token gives AUTH_RESET_LINK_INVALID", async () => {
    const { svc } = build({ identity: { resetTokenOk: false } });
    expect(code(await svc.resetPassword(makeCtx({ actorId: null }), { token: "t".repeat(20), newPassword: "plum-river-kettle-47" }))).toBe("AUTH_RESET_LINK_INVALID");
  });
  it("success ends every session and records the change", async () => {
    const { svc, identity, events, auditRepo } = build();
    expect(code(await svc.resetPassword(makeCtx({ actorId: null }), { token: "t".repeat(20), newPassword: "plum-river-kettle-47" }))).toBe("OK");
    expect(identity.calls).toContain("signOutEverywhere");
    expect(events.events.some((e) => e.type === "password_changed")).toBe(true);
    expect(auditRepo.rows.some((x) => x.action === "auth.password_reset")).toBe(true);
  });
  it("A12 confirm attempts are rate limited per address", async () => {
    const { svc } = build({ identity: { resetTokenOk: false } });
    let last = "";
    for (let i = 0; i < 31; i++) last = code(await svc.resetPassword(makeCtx({ actorId: null }), { token: "t".repeat(20), newPassword: "plum-river-kettle-47" }));
    expect(last).toBe("RATE_LIMITED");
  });
});

describe("reauthenticate and changePassword", () => {
  it("A14 a correct password marks the session", async () => {
    const { svc, reauth } = build();
    expect(code(await svc.reauthenticate(makeCtx(), { password: "right-password-1" }))).toBe("OK");
    expect(reauth.marked).toEqual([MEMBER_ID]);
  });
  it("A14 a wrong password does not mark the session", async () => {
    const { svc, reauth } = build({ identity: { passwordOk: false } });
    expect(code(await svc.reauthenticate(makeCtx(), { password: "wrong" }))).toBe("AUTH_INVALID_CREDENTIALS");
    expect(reauth.marked).toHaveLength(0);
  });
  it("reauthenticate needs a session", async () => {
    expect(code(await build({ facts: null }).svc.reauthenticate(makeCtx(), { password: "x" }))).toBe("AUTH_SESSION_EXPIRED");
  });
  it("changes the password and ends other sessions", async () => {
    const { svc, identity, events } = build({ facts: { ...session, recentlyReauthenticated: true } });
    expect(code(await svc.changePassword(makeCtx(), { currentPassword: "old-password-123", newPassword: "plum-river-kettle-47" }))).toBe("OK");
    expect(identity.calls).toEqual(expect.arrayContaining(["verifyPassword", "updatePassword", "signOutOthers"]));
    expect(events.events.some((e) => e.type === "password_changed")).toBe(true);
  });
  it("A13 a wrong current password changes nothing", async () => {
    const { svc, identity } = build({ identity: { passwordOk: false } });
    expect(code(await svc.changePassword(makeCtx(), { currentPassword: "nope", newPassword: "plum-river-kettle-47" }))).toBe("AUTH_INVALID_CREDENTIALS");
    expect(identity.calls).not.toContain("updatePassword");
  });
  it("rejects a weak or unchanged new password", async () => {
    const { svc, identity } = build();
    expect(code(await svc.changePassword(makeCtx(), { currentPassword: "old-password-123", newPassword: "Password123" }))).toBe("AUTH_PASSWORD_WEAK");
    expect(code(await svc.changePassword(makeCtx(), { currentPassword: "plum-river-kettle-47", newPassword: "plum-river-kettle-47" }))).toBe("AUTH_PASSWORD_WEAK");
    expect(identity.calls).not.toContain("updatePassword");
  });
});

describe("devices", () => {
  const rows: DeviceRecord[] = [
    { id: "d1", memberId: MEMBER_ID, sessionId: "sess-1", deviceLabel: "Chrome on Android", ip: "203.0.113.9", lastSeenAt: "2026-01-01T00:00:00Z" },
    { id: "d2", memberId: MEMBER_ID, sessionId: "sess-2", deviceLabel: "Safari on iPhone", ip: null, lastSeenAt: "2026-01-02T00:00:00Z" },
    { id: "d3", memberId: "99999999-9999-4999-8999-999999999999", sessionId: "sess-3", deviceLabel: "Other person", ip: null, lastSeenAt: "2026-01-02T00:00:00Z" },
  ];
  it("lists only the member's devices and marks the current one", async () => {
    const r = await build({ devices: rows }).svc.listDevices(makeCtx());
    expect(r.ok && r.value.map((d) => [d.id, d.current])).toEqual([["d1", true], ["d2", false]]);
  });
  it("A15 revoking another person's device is NOT_FOUND and changes nothing", async () => {
    const { svc, devices } = build({ devices: rows });
    expect(code(await svc.revokeDevice(makeCtx(), { deviceId: "d3" }))).toBe("NOT_FOUND");
    expect(devices.revoked).toHaveLength(0);
  });
  it("revokes an own device and records session_revoked", async () => {
    const { svc, devices, events } = build({ devices: rows });
    expect(code(await svc.revokeDevice(makeCtx(), { deviceId: "d2" }))).toBe("OK");
    expect(devices.revoked).toEqual(["d2"]);
    expect(events.events.some((e) => e.type === "session_revoked")).toBe(true);
  });
  it("device actions need a session", async () => {
    expect(code(await build({ facts: null }).svc.listDevices(makeCtx()))).toBe("AUTH_SESSION_EXPIRED");
    expect(code(await build({ facts: null }).svc.revokeDevice(makeCtx(), { deviceId: "d1" }))).toBe("AUTH_SESSION_EXPIRED");
  });
});
