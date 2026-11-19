import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { AuthorizationService, RequestContext } from "@/contracts/services";
import { AuthConfigError, authLogger, composeAuth } from "@/lib/auth/composition";

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
