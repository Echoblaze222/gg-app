import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { AuthService, RequestContext } from "@/contracts/services";
import type { Uuid } from "@/contracts/entities";
import { AuthConfigError, authLogger, composeAuth, readCurrentPolicyIds } from "@/lib/auth/composition";

/**
 * The one place the auth screens reach the server side services.
 *
 * getAuthService builds the real AuthService for this request (lib/auth/composition.ts). When a setting is missing or
 * the database cannot be reached it returns null, and every form then shows the SYSTEM_UNAVAILABLE message with a
 * reference number instead of pretending to work. It never returns a fake service.
 */

function logUnavailable(where: string, err: unknown): void {
  // Config errors name only the missing variable. Anything else logs its class name, never its message.
  authLogger.error(`${where}_unavailable`, err instanceof AuthConfigError ? err.message : err instanceof Error ? err.name : "unknown");
}

/** Call from server actions and route handlers: it can set the session cookies. */
export async function getAuthService(): Promise<AuthService | null> {
  try {
    return composeAuth({ cookieStore: await cookies(), writable: true }).auth;
  } catch (err) {
    logUnavailable("auth_service", err);
    return null;
  }
}

/**
 * Where to send the browser to start Google sign in or sign up, or null while that is not wired.
 * The same path serves both: Google tells us whether the account is new. Needs an OAuth route from AI-2 (routes.md lists it).
 */
export async function getGoogleAuthUrl(ctx: RequestContext): Promise<string | null> {
  void ctx;
  return null;
}

/** Ids of the policy versions a new member accepts. Read on the server so the browser can never choose them. Empty until terms and privacy are published. */
export async function getCurrentPolicyVersionIds(): Promise<Uuid[]> {
  try {
    return await readCurrentPolicyIds();
  } catch (err) {
    logUnavailable("policy_lookup", err);
    return [];
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
