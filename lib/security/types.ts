import type { RequestContext } from "@/contracts/services";
import type { Uuid } from "@/contracts/entities";

/** Facts about the current session, already verified by the auth module (token signature, device not revoked). */
export interface SessionFacts {
  memberId: Uuid;
  /** The token's session id. Lets device lists mark the current device. */
  sessionId?: string;
  /** True only when this session completed a second factor (assurance level aal2). */
  mfaVerified: boolean;
  /** True when the password was confirmed again recently. */
  recentlyReauthenticated: boolean;
}

/** Implemented by the auth module. Returns null when there is no valid session. May throw on store failure. */
export interface SessionResolver {
  resolve(ctx: RequestContext): Promise<SessionFacts | null>;
}

/** Minimal logger. Callers must never pass secrets. AI-1 provides the real one in lib/observability. */
export interface SecurityLogger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}
