import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authLogger, readCurrentPolicyIds } from "@/lib/auth/composition";
import { exchangeOAuthCode, nextStepAfterGoogle } from "@/lib/auth/flows";
import { readVerifiedSession } from "@/lib/auth/session-resolver";
import { createSupabaseAdmin } from "@/lib/auth/supabase-admin";
import { createRequestAuthFull, fromNextCookies } from "@/lib/auth/supabase-clients";
import { createAuthRepositories } from "@/lib/db/auth-repositories";
import { createAuditService } from "@/lib/security/audit";
import { buildRequestContext } from "../../(auth)/auth-gateway";

/**
 * Where Google sends the browser back. Trades the code for a session, then checks what a password sign in would check:
 * the member must be active. A member who is not active is signed out again. The destination is always one of our own
 * fixed paths, never taken from the request.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  const to = (path: string, query?: Record<string, string>): NextResponse => {
    const url = new URL(path, origin);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  const ctx = await buildRequestContext();
  try {
    const auth = createRequestAuthFull(fromNextCookies(await cookies(), { writable: true }));
    if (!(await exchangeOAuthCode(auth, request.nextUrl.searchParams.get("code") ?? ""))) return to("/login", { google: "failed" });

    const session = await readVerifiedSession(auth);
    if (!session) return to("/login", { google: "failed" });

    const repos = createAuthRepositories(createSupabaseAdmin().client);
    const member = await repos.members.getById(session.userId);
    if (!member || member.status !== "active") {
      await auth.signOut({ scope: "local" });
      return to("/login", { google: "failed" });
    }

    await repos.devices.register({ memberId: session.userId, sessionId: session.sessionId, ip: ctx.ip, userAgent: ctx.userAgent }).catch((err: unknown) => authLogger.error("device_register_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" }));
    await createAuditService({ audit: repos.audit, logger: authLogger })
      .record({ ...ctx, actorId: session.userId }, { action: "auth.login_google", result: "success" })
      .catch((err: unknown) => authLogger.error("google_audit_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" }));

    const next = await nextStepAfterGoogle({
      acceptedCurrentPolicies: async () => {
        const current = await readCurrentPolicyIds(repos.policies);
        if (current.length === 0) return false;
        const accepted = new Set((await repos.policies.listAcceptances(session.userId)).map((a) => a.policyVersionId));
        return current.every((id) => accepted.has(id));
      },
      verifiedTotpCount: async () => {
        const listed = await auth.mfa.listFactors();
        return (listed.data?.totp ?? []).filter((f) => f.status === "verified").length;
      },
    });
    return to(next);
  } catch (err) {
    authLogger.error("google_callback_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    return to("/login", { google: "failed" });
  }
}
