import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { AuthorizationService, RequestContext } from "@/contracts/services";
import type { AdminMemberService } from "@/contracts/v1_1";
import { createAdminMemberService } from "@/lib/admin/members";
import { AuthConfigError, authLogger, composeAuth } from "@/lib/auth/composition";
import { createSupabaseAdmin } from "@/lib/auth/supabase-admin";
import { createAuthRepositories } from "@/lib/db/auth-repositories";
import { createAuditService } from "@/lib/security/audit";

/**
 * The one place the admin screens reach the server side services, the same way app/(auth)/auth-gateway.ts does for
 * the auth screens. When a setting is missing or the database cannot be reached it returns null, and the page then
 * shows the SYSTEM_UNAVAILABLE state with a reference number instead of pretending to work. It never returns a fake service.
 */

/** Logs only names, codes and the reference. Never a message that could carry a secret or provider text. */
export function logAdmin(event: string, err: unknown, reference?: string): void {
  authLogger.error(event, { reference, detail: err instanceof AuthConfigError ? err.message : err instanceof Error ? err.name : "unknown" });
}

/** For Server Components: it cannot set cookies, so it is built read only. */
export async function getAdminAuthorization(): Promise<AuthorizationService | null> {
  try {
    return composeAuth({ cookieStore: await cookies(), writable: false }).authorization;
  } catch (err) {
    logAdmin("admin_authorization_unavailable", err);
    return null;
  }
}

/**
 * The real member service: the permission check comes from the auth module, the data from the real members
 * repository (service role, server only), and views and status changes are audited with the real audit service.
 * The service checks `admin.members.read` itself before it touches the repository.
 */
export async function getAdminMemberService(): Promise<AdminMemberService | null> {
  try {
    const authorization = composeAuth({ cookieStore: await cookies(), writable: false }).authorization;
    const repos = createAuthRepositories(createSupabaseAdmin().client);
    const audit = createAuditService({ audit: repos.audit, logger: authLogger });
    return createAdminMemberService({
      repositories: { server: () => ({ members: repos.members }) },
      authorization,
      audit,
      onUnexpectedError: (error, reference) => logAdmin("admin_members_unexpected", error, reference),
    });
  } catch (err) {
    logAdmin("admin_members_unavailable", err);
    return null;
  }
}

export async function buildRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    requestId: h.get("x-request-id") ?? randomUUID(),
    actorId: null,
    ip: forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : null,
    userAgent: h.get("user-agent"),
  };
}
