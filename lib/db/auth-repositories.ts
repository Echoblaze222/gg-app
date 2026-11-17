import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditRepository, MemberRepository, PolicyRepository, RateLimitRepository, RoleRepository, SecurityEventRepository } from "@/contracts/repositories";
import type { AuditLogEntry, Member, Page, PolicyAcceptance, PolicyVersion, SecurityEvent, Uuid } from "@/contracts/entities";
import type { AuditResult, MemberStatus, PolicyKind, Role, SecurityEventType, Severity } from "@/contracts/enums";
import type { DeviceRecord, DeviceStore } from "@/lib/auth/types";
import { clampLimit, cleanIp, decodeCursor, deviceLabel, encodeCursor, sanitizeSearch, UUID_RE } from "./helpers";

/**
 * Service role implementations of the repositories the auth and security modules need. Server only: the client passed
 * in holds the service role key (see lib/auth/supabase-admin.ts). Every method maps rows to the camelCase entities of
 * contracts/entities.ts, and every failure becomes a DbError with a fixed message, so no database text can leak.
 */
export class DbError extends Error {
  readonly operation: string;
  readonly code?: string;
  constructor(operation: string, code?: string) {
    super("database failure");
    this.name = "DbError";
    this.operation = operation;
    this.code = code;
  }
}

function check<T>(operation: string, res: { data: T; error: { code?: string } | null }): T {
  if (res.error) throw new DbError(operation, res.error.code);
  return res.data;
}

const UNIQUE_VIOLATION = "23505";
const SEVERITIES: readonly Severity[] = ["info", "low", "medium", "high", "critical"];

interface MemberRow {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  status: MemberStatus;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}
interface PolicyRow {
  id: string;
  kind: PolicyKind;
  version: string;
  body: string;
  draft: boolean;
  published_at: string | null;
}
interface AcceptanceRow {
  id: string;
  member_id: string;
  policy_version_id: string;
  accepted_at: string;
  ip: string | null;
}
interface EventRow {
  id: string;
  type: SecurityEventType;
  severity: Severity;
  member_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}
interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: AuditResult;
  ip: string | null;
  request_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}
interface DeviceRow {
  id: string;
  member_id: string;
  session_id: string | null;
  device_label: string;
  ip: string | null;
  last_seen_at: string;
}

const MEMBER_COLUMNS = "id,email,phone,full_name,status,email_verified_at,created_at,updated_at";
const POLICY_COLUMNS = "id,kind,version,body,draft,published_at";
const ACCEPTANCE_COLUMNS = "id,member_id,policy_version_id,accepted_at,ip";
const EVENT_COLUMNS = "id,type,severity,member_id,ip,user_agent,request_id,detail,created_at";
const AUDIT_COLUMNS = "id,actor_id,action,target_type,target_id,result,ip,request_id,detail,created_at";

const toPolicy = (r: PolicyRow): PolicyVersion => ({ id: r.id, kind: r.kind, version: r.version, body: r.body, draft: r.draft, publishedAt: r.published_at });
const toAcceptance = (r: AcceptanceRow): PolicyAcceptance => ({ id: r.id, memberId: r.member_id, policyVersionId: r.policy_version_id, acceptedAt: r.accepted_at, ip: r.ip });
const toEvent = (r: EventRow): SecurityEvent => ({ id: r.id, type: r.type, severity: r.severity, memberId: r.member_id, ip: r.ip, userAgent: r.user_agent, requestId: r.request_id, detail: r.detail ?? {}, createdAt: r.created_at });
const toAudit = (r: AuditRow): AuditLogEntry => ({ id: r.id, actorId: r.actor_id, action: r.action, targetType: r.target_type, targetId: r.target_id, result: r.result, ip: r.ip, requestId: r.request_id, detail: r.detail ?? {}, createdAt: r.created_at });
const toMember = (r: MemberRow, roles: Role[]): Member => ({ id: r.id, email: r.email, phone: r.phone, fullName: r.full_name, status: r.status, roles, emailVerifiedAt: r.email_verified_at, createdAt: r.created_at, updatedAt: r.updated_at });

/** Devices as the auth module sees them, plus the write that creates a row after sign in. */
export interface DeviceRegistry extends DeviceStore {
  /** Creates the device row for a session, or refreshes it when it exists. */
  register(input: { memberId: Uuid; sessionId: string; ip: string | null; userAgent: string | null }): Promise<void>;
}

export interface AuthRepositories {
  members: MemberRepository;
  roles: RoleRepository;
  policies: PolicyRepository;
  securityEvents: SecurityEventRepository;
  audit: AuditRepository;
  rateLimits: RateLimitRepository;
  devices: DeviceRegistry;
}

export function createAuthRepositories(db: SupabaseClient): AuthRepositories {
  async function loadRoles(ids: string[]): Promise<Map<string, Role[]>> {
    const map = new Map<string, Role[]>();
    if (ids.length === 0) return map;
    const rows = check("roles.load", await db.from("member_roles").select("member_id,role").in("member_id", ids)) as { member_id: string; role: Role }[] | null;
    for (const row of rows ?? []) map.set(row.member_id, [...(map.get(row.member_id) ?? []), row.role]);
    return map;
  }

  async function memberFromRow(row: MemberRow | null): Promise<Member | null> {
    if (!row) return null;
    return toMember(row, (await loadRoles([row.id])).get(row.id) ?? []);
  }

  const members: MemberRepository = {
    async getById(id) {
      if (!UUID_RE.test(id)) return null;
      const row = check("members.getById", await db.from("members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle()) as MemberRow | null;
      return memberFromRow(row);
    },

    async getByEmail(email) {
      const row = check("members.getByEmail", await db.from("members").select(MEMBER_COLUMNS).eq("email", email.trim().toLowerCase()).maybeSingle()) as MemberRow | null;
      return memberFromRow(row);
    },

    async list(filter, page) {
      const limit = clampLimit(page.limit);
      let query = db.from("members").select(MEMBER_COLUMNS);
      if (filter.status) query = query.eq("status", filter.status);
      const search = filter.search ? sanitizeSearch(filter.search) : "";
      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      const cursor = decodeCursor(page.cursor);
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      const rows = (check("members.list", await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)) ?? []) as MemberRow[];
      const slice = rows.slice(0, limit);
      const roles = await loadRoles(slice.map((r) => r.id));
      const last = slice[slice.length - 1];
      const out: Page<Member> = {
        items: slice.map((r) => toMember(r, roles.get(r.id) ?? [])),
        nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
      };
      return out;
    },

    async updateProfile(id, patch) {
      const update: Record<string, unknown> = {};
      if (patch.fullName !== undefined) update.full_name = patch.fullName;
      if (patch.phone !== undefined) update.phone = patch.phone;
      const row = Object.keys(update).length === 0
        ? (check("members.updateProfile", await db.from("members").select(MEMBER_COLUMNS).eq("id", id).single()) as MemberRow)
        : (check("members.updateProfile", await db.from("members").update(update).eq("id", id).select(MEMBER_COLUMNS).single()) as MemberRow);
      return (await memberFromRow(row)) as Member;
    },

    async setStatus(id, status) {
      const row = check("members.setStatus", await db.from("members").update({ status }).eq("id", id).select(MEMBER_COLUMNS).single()) as MemberRow;
      return (await memberFromRow(row)) as Member;
    },
  };

  const roles: RoleRepository = {
    async listRoles(memberId) {
      return (await loadRoles([memberId])).get(memberId) ?? [];
    },

    async listPermissions(memberId) {
      const held = (await loadRoles([memberId])).get(memberId) ?? [];
      if (held.length === 0) return [];
      const rows = (check("roles.listPermissions", await db.from("role_permissions").select("permission").in("role", held)) ?? []) as { permission: string }[];
      return [...new Set(rows.map((r) => r.permission))];
    },

    async grant(memberId, role, grantedBy) {
      const { error } = await db.from("member_roles").insert({ member_id: memberId, role, granted_by: grantedBy });
      // Granting a role the member already holds is a no-op.
      if (error && error.code !== UNIQUE_VIOLATION) throw new DbError("roles.grant", error.code);
    },

    async revoke(memberId, role) {
      check("roles.revoke", await db.from("member_roles").delete().eq("member_id", memberId).eq("role", role));
    },
  };

  const policies: PolicyRepository = {
    async getLatest(kind) {
      const rows = (check("policies.getLatest", await db.from("policy_versions").select(POLICY_COLUMNS).eq("kind", kind).not("published_at", "is", null).order("published_at", { ascending: false }).limit(1)) ?? []) as PolicyRow[];
      const row = rows[0];
      return row ? toPolicy(row) : null;
    },

    async listVersions(kind) {
      const rows = (check("policies.listVersions", await db.from("policy_versions").select(POLICY_COLUMNS).eq("kind", kind).order("created_at", { ascending: false })) ?? []) as PolicyRow[];
      return rows.map(toPolicy);
    },

    async accept({ memberId, policyVersionId, ip }) {
      const { data, error } = await db.from("policy_acceptances").insert({ member_id: memberId, policy_version_id: policyVersionId, ip: cleanIp(ip) }).select(ACCEPTANCE_COLUMNS).single();
      if (!error) return toAcceptance(data as AcceptanceRow);
      if (error.code !== UNIQUE_VIOLATION) throw new DbError("policies.accept", error.code);
      const existing = check("policies.accept", await db.from("policy_acceptances").select(ACCEPTANCE_COLUMNS).eq("member_id", memberId).eq("policy_version_id", policyVersionId).single()) as AcceptanceRow;
      return toAcceptance(existing);
    },

    async listAcceptances(memberId) {
      const rows = (check("policies.listAcceptances", await db.from("policy_acceptances").select(ACCEPTANCE_COLUMNS).eq("member_id", memberId).order("accepted_at", { ascending: false })) ?? []) as AcceptanceRow[];
      return rows.map(toAcceptance);
    },
  };

  const securityEvents: SecurityEventRepository = {
    async record(input) {
      const row = check(
        "securityEvents.record",
        await db
          .from("security_events")
          .insert({ type: input.type, severity: input.severity, member_id: input.memberId ?? null, ip: cleanIp(input.ip), user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null, request_id: input.requestId ?? null, detail: input.detail ?? {} })
          .select(EVENT_COLUMNS)
          .single(),
      ) as EventRow;
      return toEvent(row);
    },

    async list(filter, page) {
      const limit = clampLimit(page.limit);
      let query = db.from("security_events").select(EVENT_COLUMNS);
      if (filter.type) query = query.eq("type", filter.type);
      if (filter.memberId) query = query.eq("member_id", filter.memberId);
      if (filter.minSeverity) query = query.in("severity", SEVERITIES.slice(SEVERITIES.indexOf(filter.minSeverity)));
      const cursor = decodeCursor(page.cursor);
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      const rows = (check("securityEvents.list", await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)) ?? []) as EventRow[];
      const slice = rows.slice(0, limit);
      const last = slice[slice.length - 1];
      return { items: slice.map(toEvent), nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null };
    },

    async countSince({ type, memberId, ip, sinceSeconds }) {
      let query = db.from("security_events").select("id", { count: "exact", head: true }).eq("type", type).gte("created_at", new Date(Date.now() - sinceSeconds * 1000).toISOString());
      if (memberId) query = query.eq("member_id", memberId);
      const cleaned = cleanIp(ip);
      if (cleaned) query = query.eq("ip", cleaned);
      const { count, error } = await query;
      if (error) throw new DbError("securityEvents.countSince", error.code);
      return count ?? 0;
    },
  };

  const audit: AuditRepository = {
    async record(input) {
      const row = check(
        "audit.record",
        await db
          .from("audit_logs")
          .insert({ actor_id: input.actorId, action: input.action, target_type: input.targetType ?? null, target_id: input.targetId ?? null, result: input.result, ip: cleanIp(input.ip), request_id: input.requestId ?? null, detail: input.detail ?? {} })
          .select(AUDIT_COLUMNS)
          .single(),
      ) as AuditRow;
      return toAudit(row);
    },

    async list(filter, page) {
      const limit = clampLimit(page.limit);
      let query = db.from("audit_logs").select(AUDIT_COLUMNS);
      if (filter.actorId) query = query.eq("actor_id", filter.actorId);
      if (filter.action) query = query.eq("action", filter.action);
      if (filter.targetId) query = query.eq("target_id", filter.targetId);
      const cursor = decodeCursor(page.cursor);
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      const rows = (check("audit.list", await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)) ?? []) as AuditRow[];
      const slice = rows.slice(0, limit);
      const last = slice[slice.length - 1];
      return { items: slice.map(toAudit), nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null };
    },
  };

  const rateLimits: RateLimitRepository = {
    async hit(key, windowSeconds) {
      const res = await db.rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds });
      if (res.error) throw new DbError("rateLimits.hit", res.error.code);
      const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { count: number; window_ends_at: string } | undefined;
      if (!row || typeof row.count !== "number") throw new DbError("rateLimits.hit");
      return { count: row.count, windowEndsAt: row.window_ends_at };
    },
  };

  const devices: DeviceRegistry = {
    async listActiveByMember(memberId) {
      const rows = (check(
        "devices.list",
        await db.from("device_sessions").select("id,member_id,session_id,device_label,ip,last_seen_at").eq("member_id", memberId).is("revoked_at", null).not("session_id", "is", null).order("last_seen_at", { ascending: false }),
      ) ?? []) as DeviceRow[];
      return rows.map((r): DeviceRecord => ({ id: r.id, memberId: r.member_id, sessionId: r.session_id ?? "", deviceLabel: r.device_label, ip: r.ip, lastSeenAt: r.last_seen_at }));
    },

    async revoke(memberId, deviceId) {
      if (!UUID_RE.test(deviceId)) return false;
      const row = check("devices.find", await db.from("device_sessions").select("id,session_id").eq("id", deviceId).eq("member_id", memberId).is("revoked_at", null).maybeSingle()) as { id: string; session_id: string | null } | null;
      if (!row) return false;
      // The mark comes first: the session resolver refuses a marked session even if ending the provider session fails.
      check("devices.revoke", await db.from("device_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", row.id).is("revoked_at", null));
      if (row.session_id) {
        const { error } = await db.rpc("revoke_session", { target_user_id: memberId, target_session_id: row.session_id });
        if (error) throw new DbError("devices.revoke_session", error.code);
      }
      return true;
    },

    async register({ memberId, sessionId, ip, userAgent }) {
      const existing = check("devices.find", await db.from("device_sessions").select("id").eq("member_id", memberId).eq("session_id", sessionId).maybeSingle()) as { id: string } | null;
      if (existing) {
        check("devices.touch", await db.from("device_sessions").update({ last_seen_at: new Date().toISOString(), ip: cleanIp(ip) }).eq("id", existing.id));
        return;
      }
      check("devices.insert", await db.from("device_sessions").insert({ member_id: memberId, session_id: sessionId, device_label: deviceLabel(userAgent), ip: cleanIp(ip), user_agent: userAgent ? userAgent.slice(0, 500) : null }));
    },
  };

  return { members, roles, policies, securityEvents, audit, rateLimits, devices };
}
