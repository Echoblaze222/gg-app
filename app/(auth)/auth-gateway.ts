import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { AuthService, RequestContext } from "@/contracts/services";
import type { Uuid } from "@/contracts/entities";

/**
 * The one place the auth screens reach the server side services.
 *
 * AI-2 owns the real AuthService (lib/auth, createAuthService) but the app does not yet have a composition root that
 * builds it with a database, a session store and cookies. Until it does, both getters return nothing and every form
 * shows the SYSTEM_UNAVAILABLE message instead of pretending to work. Wiring it later is a change in this file only.
 */

export function getAuthService(): AuthService | null {
  return null;
}

/** Ids of the policy versions a new member accepts. Read on the server so the browser can never choose them. */
export async function getCurrentPolicyVersionIds(): Promise<Uuid[]> {
  return [];
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
