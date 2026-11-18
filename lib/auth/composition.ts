import type { AuthorizationService, AuthService, RequestContext } from "@/contracts/services";
import type { PolicyRepository } from "@/contracts/repositories";
import { createAuthRepositories } from "@/lib/db/auth-repositories";
import { createAuditService } from "@/lib/security/audit";
import { createAuthorizationService } from "@/lib/security/authorization";
import { createSecurityEventService } from "@/lib/security/events";
import { createRateLimiter } from "@/lib/security/rate-limit";
import type { SecurityLogger } from "@/lib/security/types";
import { createDeviceGate } from "./device-gate";
import { createReauthStore } from "./reauth-store";
import { createAuthService } from "./service";
import { createSessionResolver, readVerifiedSession } from "./session-resolver";
import { createSupabaseAdmin } from "./supabase-admin";
import { createRequestAuth, createStatelessAuth, fromNextCookies, type NextCookieStore } from "./supabase-clients";
import { createSupabaseIdentity } from "./supabase-identity";

/** A setting is missing. The message names the variable only, so it is safe to log. */
export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/** Logs go to stderr as JSON. Callers pass names, codes and ids only, never secrets or provider text. */
export const authLogger: SecurityLogger = {
  error: (...args) => console.error("[auth]", ...args),
  warn: (...args) => console.warn("[auth]", ...args),
};

export interface AuthComposition {
  auth: AuthService;
  authorization: AuthorizationService;
}

/**
 * Builds the real AuthService for one request. Nothing is shared between requests: the cookie bound client, the
 * session resolver and the reauth store all belong to this request's cookies.
 * `writable` is true in server actions and route handlers, false in Server Components.
 */
export function composeAuth(opts: { cookieStore: NextCookieStore; writable: boolean; logger?: SecurityLogger }): AuthComposition {
  const logger = opts.logger ?? authLogger;
  const hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!hmacSecret) throw new AuthConfigError("RATE_LIMIT_HMAC_SECRET is not set");

  const admin = createSupabaseAdmin();
  const repos = createAuthRepositories(admin.client);
  const requestAuth = createRequestAuth(fromNextCookies(opts.cookieStore, { writable: opts.writable }));

  const identity = createSupabaseIdentity({
    request: requestAuth,
    stateless: () => createStatelessAuth(),
    admin: admin.admin,
    revokeAllSessions: (userId) => admin.revokeAllSessions(userId),
    logger,
  });
  const reauth = createReauthStore({ db: admin.reauthDb, auth: requestAuth });
  const sessions = createSessionResolver({ auth: requestAuth, reauth, devices: createDeviceGate({ db: admin.deviceDb }), logger });

  const events = createSecurityEventService({ events: repos.securityEvents, logger });
  const limiter = createRateLimiter({ limits: repos.rateLimits, events, hmacSecret, logger });
  const audit = createAuditService({ audit: repos.audit, logger });
  const authorization = createAuthorizationService({ sessions, members: repos.members, roles: repos.roles, audit, logger });

  const base = createAuthService({
    identity,
    sessions,
    members: repos.members,
    roles: repos.roles,
    policies: repos.policies,
    limiter,
    authorization,
    audit,
    events,
    devices: repos.devices,
    reauth,
    hmacSecret,
    logger,
  });

  /** A device row is what makes remote sign out possible, so every successful sign in creates one. A failure here never blocks the sign in. */
  async function registerDevice(ctx: RequestContext): Promise<void> {
    const session = await readVerifiedSession(requestAuth);
    if (!session) return;
    await repos.devices.register({ memberId: session.userId, sessionId: session.sessionId, ip: ctx.ip, userAgent: ctx.userAgent });
  }

  const auth: AuthService = {
    ...base,
    async login(ctx, input) {
      const result = await base.login(ctx, input);
      if (result.ok) {
        await registerDevice(ctx).catch((err: unknown) => logger.error("device_register_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" }));
      }
      return result;
    },
  };

  return { auth, authorization };
}

/** Latest published terms and privacy policy, read with the server role. Both must exist for registration to open. */
export async function readCurrentPolicyIds(policies?: PolicyRepository): Promise<string[]> {
  const repo = policies ?? createAuthRepositories(createSupabaseAdmin().client).policies;
  const [terms, privacy] = await Promise.all([repo.getLatest("terms"), repo.getLatest("privacy")]);
  return terms && privacy ? [terms.id, privacy.id] : [];
}
