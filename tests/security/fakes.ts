/** Test doubles for AI-2 security tests. Only imported from tests. */
import type { RequestContext } from "@/contracts/services";
import type { AuditRepository, MemberRepository, RoleRepository } from "@/contracts/repositories";
import type { Member } from "@/contracts/entities";
import type { MemberStatus, Role } from "@/contracts/enums";
import { DEFAULT_ROLE_PERMISSIONS } from "@/contracts/permissions";
import type { SessionFacts, SessionResolver, SecurityLogger } from "@/lib/security/types";

export const MEMBER_ID = "11111111-1111-4111-8111-111111111111";

export function makeCtx(over: Partial<RequestContext> = {}): RequestContext {
  return { requestId: "req_test_1", actorId: MEMBER_ID, ip: "203.0.113.9", userAgent: "vitest", ...over };
}

export function fakeResolver(facts: SessionFacts | null): SessionResolver {
  return { resolve: async () => facts };
}

export function throwingResolver(): SessionResolver {
  return { resolve: async () => { throw new Error("session store down"); } };
}

export function fakeMembers(status: MemberStatus | null): MemberRepository {
  const member = status === null ? null : ({ id: MEMBER_ID, status } as unknown as Member);
  return {
    getById: async () => member,
    getByEmail: async () => member,
    list: async () => { throw new Error("not used"); },
    updateProfile: async () => { throw new Error("not used"); },
    setStatus: async () => { throw new Error("not used"); },
  };
}

export function fakeRoles(roles: Role[], opts: { fail?: boolean; failWrites?: boolean } = {}): RoleRepository & { granted: unknown[]; revoked: unknown[] } {
  const granted: unknown[] = [];
  const revoked: unknown[] = [];
  const perms = [...new Set(roles.flatMap((r) => [...DEFAULT_ROLE_PERMISSIONS[r]]))];
  return {
    granted,
    revoked,
    listRoles: async () => { if (opts.fail) throw new Error("db down"); return roles; },
    listPermissions: async () => { if (opts.fail) throw new Error("db down"); return perms; },
    grant: async (...a) => { if (opts.failWrites) throw new Error("write failed"); granted.push(a); },
    revoke: async (...a) => { if (opts.failWrites) throw new Error("write failed"); revoked.push(a); },
  };
}

export interface RecordedAudit { actorId: string | null; action: string; result: string; detail?: Record<string, unknown>; targetId?: string | null }

export function fakeAuditRepo(opts: { fail?: boolean } = {}): AuditRepository & { rows: RecordedAudit[] } {
  const rows: RecordedAudit[] = [];
  return {
    rows,
    record: async (input) => {
      if (opts.fail) throw new Error("audit table unavailable");
      rows.push(input as RecordedAudit);
      return { id: "a1", createdAt: "2026-01-01T00:00:00Z", ...input } as never;
    },
    list: async () => { throw new Error("not used"); },
  };
}

export function fakeLogger(): SecurityLogger & { errors: unknown[][] } {
  const errors: unknown[][] = [];
  return { errors, error: (...args: unknown[]) => { errors.push(args); }, warn: () => {} };
}
