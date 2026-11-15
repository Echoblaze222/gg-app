import { AppError, type ErrorCode, type Result } from "@/contracts/errors";
import type { MemberRepository, RoleRepository } from "@/contracts/repositories";
import type { AuthorizationService, RequestContext, SessionInfo } from "@/contracts/services";
import { PRIVILEGED_ROLES, ROLES, type Role } from "@/contracts/enums";
import { PERMISSIONS, REAUTH_REQUIRED_PERMISSIONS, type PermissionName } from "@/contracts/permissions";
import type { StrictAuditService } from "./audit";
import type { SecurityLogger, SessionResolver } from "./types";

export interface AuthorizationDeps {
  sessions: SessionResolver;
  members: MemberRepository;
  roles: RoleRepository;
  audit: StrictAuditService;
  logger?: SecurityLogger;
}

function fail<T>(code: ErrorCode, ctx: RequestContext): Result<T> {
  return { ok: false, error: new AppError(code, { reference: ctx.requestId }).toShape() };
}

const KNOWN_PERMISSIONS: readonly string[] = PERMISSIONS;
const REAUTH_PERMISSIONS: readonly string[] = REAUTH_REQUIRED_PERMISSIONS;
const KNOWN_ROLES: readonly string[] = ROLES;

export function createAuthorizationService(deps: AuthorizationDeps): AuthorizationService {
  async function requirePermission(ctx: RequestContext, permission: PermissionName, opts?: { requireReauth?: boolean }): Promise<Result<SessionInfo>> {
    try {
      // 1. Verified session
      const facts = await deps.sessions.resolve(ctx);
      if (!facts) return fail("AUTH_SESSION_EXPIRED", ctx);
      const actorCtx: RequestContext = { ...ctx, actorId: facts.memberId };

      // 2. Account state. A missing member looks the same as an expired session.
      const member = await deps.members.getById(facts.memberId);
      if (!member) return fail("AUTH_SESSION_EXPIRED", ctx);
      if (member.status === "suspended" || member.status === "closed") return fail("AUTH_ACCOUNT_SUSPENDED", ctx);
      if (member.status === "pending_verification") return fail("AUTH_EMAIL_NOT_VERIFIED", ctx);

      // 3. Permission, checked before MFA and reauth so a caller without it learns nothing about those states.
      const [roles, held] = await Promise.all([deps.roles.listRoles(facts.memberId), deps.roles.listPermissions(facts.memberId)]);
      if (!KNOWN_PERMISSIONS.includes(permission) || !held.includes(permission)) {
        await deps.audit.record(actorCtx, { action: "authz.denied", targetType: "permission", targetId: String(permission), result: "denied" });
        return fail("PERMISSION_DENIED", ctx);
      }

      // 4. Privileged roles must have completed MFA in this session, for every permission.
      if (roles.some((r) => (PRIVILEGED_ROLES as readonly Role[]).includes(r)) && !facts.mfaVerified) {
        await deps.audit.record(actorCtx, { action: "authz.mfa_missing", targetType: "permission", targetId: permission, result: "denied" });
        return fail("AUTH_MFA_REQUIRED", ctx);
      }

      // 5. Recent password confirmation for sensitive actions
      if ((opts?.requireReauth || REAUTH_PERMISSIONS.includes(permission)) && !facts.recentlyReauthenticated) {
        return fail("AUTH_REAUTH_REQUIRED", ctx);
      }

      return { ok: true, value: { memberId: facts.memberId, roles, recentlyReauthenticated: facts.recentlyReauthenticated, mfaVerified: facts.mfaVerified } };
    } catch (err) {
      // Fail closed: any dependency problem denies access.
      deps.logger?.error("authz_dependency_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
      return fail("INTERNAL", ctx);
    }
  }

  async function changeRole(ctx: RequestContext, input: { memberId: string; role: Role }, kind: "grant" | "revoke"): Promise<Result<void>> {
    if (!KNOWN_ROLES.includes(input.role)) return fail("VALIDATION_FAILED", ctx);
    const gate = await requirePermission(ctx, "admin.roles.manage");
    if (!gate.ok) return gate;
    const actorCtx: RequestContext = { ...ctx, actorId: gate.value.memberId };
    // Nobody changes their own roles. This also stops the last owner removing themselves.
    if (input.memberId === gate.value.memberId) {
      await deps.audit.record(actorCtx, { action: `role.${kind}`, targetType: "member", targetId: input.memberId, result: "denied", detail: { role: input.role, reason: "self_change" } });
      return fail("PERMISSION_DENIED", ctx);
    }
    const detail = { role: input.role };
    try {
      // Audit first and strictly: no privileged change happens without a stored trail.
      await deps.audit.recordStrict(actorCtx, { action: `role.${kind}`, targetType: "member", targetId: input.memberId, result: "success", detail: { ...detail, phase: "attempt" } });
      if (kind === "grant") await deps.roles.grant(input.memberId, input.role, gate.value.memberId);
      else await deps.roles.revoke(input.memberId, input.role);
      return { ok: true, value: undefined };
    } catch (err) {
      deps.logger?.error("role_change_failed", { requestId: ctx.requestId, kind, errorName: err instanceof Error ? err.name : "unknown" });
      await deps.audit.record(actorCtx, { action: `role.${kind}`, targetType: "member", targetId: input.memberId, result: "failure", detail });
      return fail("INTERNAL", ctx);
    }
  }

  return {
    requirePermission,
    grantRole: (ctx, input) => changeRole(ctx, input, "grant"),
    revokeRole: (ctx, input) => changeRole(ctx, input, "revoke"),
  };
}
