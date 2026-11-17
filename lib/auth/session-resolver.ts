import type { SessionFacts, SessionResolver, SecurityLogger } from "@/lib/security/types";
import type { SbAuth } from "./supabase-like";
import { IdentityProviderError } from "./supabase-identity";

export interface SessionResolverDeps {
  /** Bound to the current request's cookies. Never refreshed or written here. */
  auth: SbAuth;
  reauth: { isRecent(sessionId: string, memberId: string): Promise<boolean> };
  devices: { isRevoked(memberId: string, sessionId: string): Promise<boolean> };
  logger: SecurityLogger;
}

/** Reads claims from a token the Auth server has just confirmed. Not a verification step by itself. */
function decodeClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A 4xx from the Auth server means the token is not good. Anything else (5xx, no status, 429) is an outage. */
const isRejection = (status: number | undefined) => typeof status === "number" && status >= 400 && status < 500 && status !== 429;

export function createSessionResolver(deps: SessionResolverDeps): SessionResolver {
  return {
    async resolve(): Promise<SessionFacts | null> {
      try {
        const cookie = await deps.auth.getSession();
        if (cookie.error) throw new IdentityProviderError("resolve", cookie.error.code);
        if (!cookie.data.session) return null;
        const token = cookie.data.session.access_token;

        // Ask the Auth server about exactly this token. This is what notices a revoked session.
        const { data, error } = await deps.auth.getUser(token);
        if (error) {
          if (isRejection(error.status)) return null;
          throw new IdentityProviderError("resolve", error.code);
        }
        const verified = data.user;
        if (!verified) return null;

        // Claims come from the same token. Identity comes from the verified user, and the two must agree.
        const claims = decodeClaims(token);
        if (!claims || claims.sub !== verified.id) return null;
        const sessionId = typeof claims.session_id === "string" && claims.session_id.length > 0 ? claims.session_id : null;
        if (!sessionId) return null;

        if (await deps.devices.isRevoked(verified.id, sessionId)) return null;
        const recentlyReauthenticated = await deps.reauth.isRecent(sessionId, verified.id);

        return { memberId: verified.id, sessionId, mfaVerified: claims.aal === "aal2", recentlyReauthenticated };
      } catch (e) {
        if (e instanceof IdentityProviderError) throw e;
        deps.logger.error("identity.resolve_failed", { name: e instanceof Error ? e.name : "unknown" });
        throw new IdentityProviderError("resolve");
      }
    },
  };
}
