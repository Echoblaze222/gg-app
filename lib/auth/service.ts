import { createHmac, randomUUID } from "node:crypto";
import { AppError, type ErrorCode, type Result } from "@/contracts/errors";
import { PRIVILEGED_ROLES, type Role } from "@/contracts/enums";
import type { Uuid } from "@/contracts/entities";
import type { MemberRepository, PolicyRepository, RoleRepository } from "@/contracts/repositories";
import type { AuthorizationService, AuthService, RateLimiter, RateLimitRule, RequestContext, SecurityEventService } from "@/contracts/services";
import { emailSchema, phoneSchema } from "@/contracts/schemas";
import type { StrictAuditService } from "@/lib/security/audit";
import type { SecurityLogger, SessionFacts, SessionResolver } from "@/lib/security/types";
import { isPasswordAcceptable, normalizeNigerianPhone } from "./password";
import { RULES } from "./rules";
import type { DeviceStore, IdentityProvider, ReauthStore } from "./types";

export interface AuthDeps {
  identity: IdentityProvider;
  sessions: SessionResolver;
  members: MemberRepository;
  roles: RoleRepository;
  policies: PolicyRepository;
  limiter: RateLimiter;
  authorization: AuthorizationService;
  audit: StrictAuditService;
  events: SecurityEventService;
  devices: DeviceStore;
  reauth: ReauthStore;
  /** Same secret as the rate limiter (RATE_LIMIT_HMAC_SECRET). Used to key account counters on the typed email. */
  hmacSecret: string;
  logger: SecurityLogger;
}

type Failure = Extract<Result<never>, { ok: false }>;
const OK: Result<void> = { ok: true, value: undefined };
const MAX_PASSWORD_INPUT = 1024;
const MFA_CODE = /^\d{6}$/;

function fail<T>(code: ErrorCode, ctx: RequestContext, fields?: Record<string, string>): Result<T> {
  return { ok: false, error: new AppError(code, { reference: ctx.requestId, fields }).toShape() };
}

export function createAuthService(deps: AuthDeps): AuthService {
  const errName = (err: unknown) => (err instanceof Error ? err.name : "unknown");

  /** Looks like a UUID, is a keyed hash of the typed identifier. Existing and unknown emails get the same treatment. */
  function pseudoId(identifier: string): Uuid {
    const h = createHmac("sha256", deps.hmacSecret).update(`acct:${identifier}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  async function guard<T>(ctx: RequestContext, fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await fn();
    } catch (err) {
      deps.logger.error("auth_failure", { requestId: ctx.requestId, errorName: errName(err) });
      return fail("SYSTEM_UNAVAILABLE", ctx);
    }
  }

  async function emit(ctx: RequestContext, event: Parameters<SecurityEventService["record"]>[1]): Promise<void> {
    try {
      await deps.events.record(ctx, event);
    } catch (err) {
      deps.logger.error("security_event_failed", { requestId: ctx.requestId, type: event.type, errorName: errName(err) });
    }
  }

  /** Returns an error result when blocked, or null when allowed. */
  async function limit(ctx: RequestContext, rule: RateLimitRule, memberId?: Uuid): Promise<Failure | null> {
    const r = await deps.limiter.check(ctx, rule, memberId ? { memberId } : undefined);
    return r.ok ? null : r;
  }

  async function requireSession(ctx: RequestContext): Promise<SessionFacts | null> {
    return deps.sessions.resolve(ctx);
  }

  async function isPrivileged(memberId: Uuid): Promise<boolean> {
    const roles: Role[] = await deps.roles.listRoles(memberId);
    return roles.some((r) => (PRIVILEGED_ROLES as readonly Role[]).includes(r));
  }

  async function reauthenticateWith(ctx: RequestContext, facts: SessionFacts, password: string): Promise<Result<void>> {
    const blocked = await limit(ctx, RULES.reauth, facts.memberId);
    if (blocked) return blocked;
    if (password.length === 0 || password.length > MAX_PASSWORD_INPUT || !(await deps.identity.verifyPassword({ userId: facts.memberId, password }))) {
      await emit(ctx, { type: "login_failed", severity: "low", memberId: facts.memberId, detail: { context: "reauth" } });
      return fail("AUTH_INVALID_CREDENTIALS", ctx);
    }
    await deps.reauth.mark(ctx, facts.memberId);
    await deps.audit.record({ ...ctx, actorId: facts.memberId }, { action: "auth.reauth", result: "success" });
    return OK;
  }

  return {
    register: (ctx, input) =>
      guard(ctx, async () => {
        const parsedEmail = emailSchema.safeParse(input.email.trim());
        const email = parsedEmail.success ? parsedEmail.data : null;
        const blocked = await limit(ctx, RULES.register, pseudoId((email ?? input.email.trim().toLowerCase()).slice(0, 254)));
        if (blocked) return blocked;

        const fields: Record<string, string> = {};
        if (!email) fields.email = "Enter a valid email address.";
        const fullName = input.fullName.trim();
        if (fullName.length < 2 || fullName.length > 100) fields.fullName = "Enter your full name.";
        let phone: string | undefined;
        if (input.phone !== undefined && input.phone !== "") {
          const normalized = phoneSchema.safeParse(input.phone).success ? normalizeNigerianPhone(input.phone) : null;
          if (normalized) phone = normalized;
          else fields.phone = "Enter a valid Nigerian phone number.";
        }
        if (Object.keys(fields).length > 0 || !email) return fail("VALIDATION_FAILED", ctx, fields);

        if (!isPasswordAcceptable(input.password, { email, fullName })) return fail("AUTH_PASSWORD_WEAK", ctx);

        // The latest terms and privacy policy must be accepted. With none published, registration stays closed.
        const [terms, privacy] = await Promise.all([deps.policies.getLatest("terms"), deps.policies.getLatest("privacy")]);
        if (!terms || !privacy) {
          deps.logger.error("register_no_published_policy", { requestId: ctx.requestId });
          return fail("SYSTEM_UNAVAILABLE", ctx);
        }
        if (!input.acceptedPolicyVersionIds.includes(terms.id) || !input.acceptedPolicyVersionIds.includes(privacy.id)) {
          return fail("VALIDATION_FAILED", ctx, { acceptedPolicyVersionIds: "Accept the current terms and privacy policy to continue." });
        }

        const created = await deps.identity.signUp({ email, password: input.password, fullName, phone });
        if (created.alreadyRegistered) {
          // Same answer as a new account. The real owner of the address is told by email by the provider.
          await deps.audit.record({ ...ctx, actorId: null }, { action: "auth.register_duplicate", result: "denied" });
          return { ok: true, value: { memberId: randomUUID(), verificationSent: true } };
        }

        const actorCtx = { ...ctx, actorId: created.userId };
        try {
          for (const id of [terms.id, privacy.id]) await deps.policies.accept({ memberId: created.userId, policyVersionId: id, ip: ctx.ip });
        } catch (err) {
          deps.logger.error("register_policy_accept_failed", { requestId: ctx.requestId, errorName: errName(err) });
          await deps.audit.record(actorCtx, { action: "auth.register_policy_accept", result: "failure" });
        }
        await deps.audit.record(actorCtx, { action: "auth.register", result: "success" });
        return { ok: true, value: { memberId: created.userId, verificationSent: created.verificationSent } };
      }),

    login: (ctx, input) =>
      guard(ctx, async () => {
        const parsed = emailSchema.safeParse(input.identifier.trim());
        const email = parsed.success ? parsed.data : null;
        const blocked = await limit(ctx, RULES.login, pseudoId((email ?? input.identifier.trim().toLowerCase()).slice(0, 254)));
        if (blocked) return blocked.error.code === "RATE_LIMITED" ? fail("AUTH_ACCOUNT_LOCKED", ctx) : blocked;

        if (!email || input.password.length === 0 || input.password.length > MAX_PASSWORD_INPUT) {
          await emit(ctx, { type: "login_failed", severity: "low" });
          return fail("AUTH_INVALID_CREDENTIALS", ctx);
        }

        const out = await deps.identity.signInWithPassword({ email, password: input.password });
        if (out.status === "invalid_credentials") {
          await emit(ctx, { type: "login_failed", severity: "low" });
          return fail("AUTH_INVALID_CREDENTIALS", ctx);
        }
        if (out.status === "email_not_verified") return fail("AUTH_EMAIL_NOT_VERIFIED", ctx);

        const member = await deps.members.getById(out.userId);
        if (!member) {
          deps.logger.error("login_missing_profile", { requestId: ctx.requestId });
          await deps.identity.signOut();
          return fail("AUTH_INVALID_CREDENTIALS", ctx);
        }
        if (member.status === "suspended" || member.status === "closed") {
          await deps.identity.signOut();
          return fail("AUTH_ACCOUNT_SUSPENDED", ctx);
        }

        await emit(ctx, { type: "login_succeeded", severity: "info", memberId: out.userId });
        return { ok: true, value: { mfaRequired: out.mfaEnrolled || (await isPrivileged(out.userId)) } };
      }),

    verifyMfa: (ctx, input) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        const blocked = await limit(ctx, RULES.mfaVerify, facts.memberId);
        if (blocked) return blocked;
        if (!MFA_CODE.test(input.code) || !(await deps.identity.verifyTotp({ code: input.code }))) {
          await emit(ctx, { type: "mfa_failed", severity: "medium", memberId: facts.memberId });
          return fail("AUTH_MFA_INVALID", ctx);
        }
        await deps.audit.record({ ...ctx, actorId: facts.memberId }, { action: "auth.mfa_verified", result: "success" });
        return OK;
      }),

    logout: async (ctx) => {
      try {
        await deps.identity.signOut();
      } catch (err) {
        deps.logger.error("logout_failed", { requestId: ctx.requestId, errorName: errName(err) });
      }
      return OK;
    },

    getSession: (ctx) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        const member = await deps.members.getById(facts.memberId);
        if (!member) return fail("AUTH_SESSION_EXPIRED", ctx);
        if (member.status === "suspended" || member.status === "closed") return fail("AUTH_ACCOUNT_SUSPENDED", ctx);
        const roles = await deps.roles.listRoles(facts.memberId);
        return { ok: true, value: { memberId: facts.memberId, roles, recentlyReauthenticated: facts.recentlyReauthenticated, mfaVerified: facts.mfaVerified } };
      }),

    requestPasswordReset: (ctx, input) =>
      guard(ctx, async () => {
        const parsed = emailSchema.safeParse(input.identifier.trim());
        const blocked = await limit(ctx, RULES.passwordResetRequest, pseudoId((parsed.success ? parsed.data : input.identifier.trim().toLowerCase()).slice(0, 254)));
        if (blocked) return blocked;
        if (parsed.success) {
          try {
            await deps.identity.requestPasswordReset({ email: parsed.data });
          } catch (err) {
            deps.logger.error("reset_request_failed", { requestId: ctx.requestId, errorName: errName(err) });
          }
        }
        await emit(ctx, { type: "password_reset_requested", severity: "info" });
        return OK;
      }),

    resetPassword: (ctx, input) =>
      guard(ctx, async () => {
        const blocked = await limit(ctx, RULES.passwordResetConfirm);
        if (blocked) return blocked;
        if (!isPasswordAcceptable(input.newPassword, { email: "", fullName: "" })) return fail("AUTH_PASSWORD_WEAK", ctx);
        if (input.token.length === 0 || input.token.length > 2048) return fail("AUTH_RESET_LINK_INVALID", ctx);
        const out = await deps.identity.resetPasswordWithToken({ token: input.token, newPassword: input.newPassword });
        if (out.status !== "ok") return fail("AUTH_RESET_LINK_INVALID", ctx);
        await deps.identity.signOutEverywhere(out.userId);
        await emit(ctx, { type: "password_changed", severity: "medium", memberId: out.userId });
        await deps.audit.record({ ...ctx, actorId: out.userId }, { action: "auth.password_reset", result: "success" });
        return OK;
      }),

    reauthenticate: (ctx, input) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        return reauthenticateWith(ctx, facts, input.password);
      }),

    changePassword: (ctx, input) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        const member = await deps.members.getById(facts.memberId);
        const who = { email: member?.email ?? "", fullName: member?.fullName ?? "" };
        if (input.newPassword === input.currentPassword || !isPasswordAcceptable(input.newPassword, who)) return fail("AUTH_PASSWORD_WEAK", ctx);

        const confirmed = await reauthenticateWith(ctx, facts, input.currentPassword);
        if (!confirmed.ok) return confirmed;
        const allowed = await deps.authorization.requirePermission(ctx, "member.security.manage");
        if (!allowed.ok) return allowed;

        await deps.identity.updatePassword({ userId: facts.memberId, newPassword: input.newPassword });
        await deps.identity.signOutOthers();
        await emit(ctx, { type: "password_changed", severity: "medium", memberId: facts.memberId });
        await deps.audit.record({ ...ctx, actorId: facts.memberId }, { action: "auth.password_change", result: "success" });
        return OK;
      }),

    listDevices: (ctx) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        const rows = await deps.devices.listActiveByMember(facts.memberId);
        return { ok: true, value: rows.map((d) => ({ id: d.id, deviceLabel: d.deviceLabel, ip: d.ip, lastSeenAt: d.lastSeenAt, current: d.sessionId === facts.sessionId })) };
      }),

    revokeDevice: (ctx, input) =>
      guard(ctx, async () => {
        const facts = await requireSession(ctx);
        if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
        if (!(await deps.devices.revoke(facts.memberId, input.deviceId))) return fail("NOT_FOUND", ctx);
        await emit(ctx, { type: "session_revoked", severity: "info", memberId: facts.memberId });
        await deps.audit.record({ ...ctx, actorId: facts.memberId }, { action: "auth.device_revoke", targetType: "device", targetId: input.deviceId, result: "success" });
        return OK;
      }),
  };
}
