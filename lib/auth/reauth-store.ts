import type { ReauthStore } from "./types";
import type { RequestContext } from "@/contracts/services";
import type { SbAuth, SbError } from "./supabase-like";
import { readVerifiedSession } from "./session-resolver";
import { IdentityProviderError } from "./supabase-identity";

/** How long a password confirmation counts as recent. Ten minutes. */
export const REAUTH_WINDOW_SECONDS = 600;
/** The app clock writes and reads the timestamp, but two instances can differ a little. Anything further ahead is refused. */
const FUTURE_SKEW_MS = 30_000;

/** Narrow view of public.session_reauth. The real one runs with the service role (see supabase-admin.ts). */
export interface ReauthDb {
  upsert(row: { session_id: string; member_id: string; confirmed_at: string }): Promise<{ error: SbError | null }>;
  get(sessionId: string, memberId: string): Promise<{ data: { confirmed_at: string } | null; error: SbError | null }>;
}

export interface ReauthStoreDeps {
  db: ReauthDb;
  /** Bound to the current request's cookies. Used to find out which session is confirming. */
  auth: SbAuth;
  now?: () => Date;
  windowSeconds?: number;
}

export function createReauthStore(deps: ReauthStoreDeps): ReauthStore & { isRecent(sessionId: string, memberId: string): Promise<boolean> } {
  const now = deps.now ?? (() => new Date());
  const windowMs = (deps.windowSeconds ?? REAUTH_WINDOW_SECONDS) * 1000;

  return {
    async mark(_ctx: RequestContext, memberId: string): Promise<void> {
      // The session id comes from the verified cookie session, never from the caller, and the caller's member id
      // must be the person that session belongs to. Nobody can mark a session that is not theirs.
      const session = await readVerifiedSession(deps.auth).catch((e: unknown) => {
        throw e instanceof IdentityProviderError ? e : new IdentityProviderError("reauth.mark");
      });
      if (!session || session.userId !== memberId) throw new IdentityProviderError("reauth.mark");
      const { error } = await deps.db.upsert({ session_id: session.sessionId, member_id: memberId, confirmed_at: now().toISOString() }).catch(() => {
        throw new IdentityProviderError("reauth.mark");
      });
      if (error) throw new IdentityProviderError("reauth.mark", error.code);
    },

    async isRecent(sessionId: string, memberId: string): Promise<boolean> {
      const { data, error } = await deps.db.get(sessionId, memberId).catch(() => {
        throw new IdentityProviderError("reauth.read");
      });
      if (error) throw new IdentityProviderError("reauth.read", error.code);
      if (!data) return false;
      const confirmed = Date.parse(data.confirmed_at);
      if (Number.isNaN(confirmed)) return false;
      const age = now().getTime() - confirmed;
      return age >= -FUTURE_SKEW_MS && age <= windowMs;
    },
  };
}
