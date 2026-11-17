import type { IdentityProvider } from "./types";
import type { SbAdmin, SbAuth, SbError } from "./supabase-like";
import type { SecurityLogger } from "@/lib/security/types";

/**
 * Thrown for every provider or store failure. The message is fixed and never carries provider text, so it is safe
 * to log and cannot leak into a response. `providerCode` is the provider's short error code, which is safe to log.
 */
export class IdentityProviderError extends Error {
  readonly operation: string;
  readonly providerCode?: string;
  constructor(operation: string, providerCode?: string) {
    super("identity provider failure");
    this.name = "IdentityProviderError";
    this.operation = operation;
    this.providerCode = providerCode;
  }
}

export interface SupabaseIdentityDeps {
  /** Bound to the current request's cookies. */
  request: SbAuth;
  /** A fresh client with no cookie storage and no session persistence. Called once per operation that needs one. */
  stateless: () => SbAuth;
  /** Service role admin API. Server only. */
  admin: SbAdmin;
  /** Deletes every session of a user (SQL function, see spec problem 2). */
  revokeAllSessions(userId: string): Promise<void>;
  logger: SecurityLogger;
}

const fail = (operation: string, error?: SbError | null) => new IdentityProviderError(operation, error?.code);

/** Maps anything thrown inside an operation to IdentityProviderError, so no raw error escapes. */
async function guard<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof IdentityProviderError) throw e;
    throw new IdentityProviderError(operation);
  }
}

export function createSupabaseIdentity(deps: SupabaseIdentityDeps): IdentityProvider {
  const { request, admin, logger } = deps;

  /** Ends the session of this client only. Never throws. Never uses the global scope. */
  async function closeLocal(client: SbAuth, operation: string): Promise<void> {
    try {
      const { error } = await client.signOut({ scope: "local" });
      if (error) logger.error("identity.session_close_failed", { operation, code: error.code });
    } catch {
      logger.error("identity.session_close_failed", { operation });
    }
  }

  async function hasVerifiedFactor(client: SbAuth, operation: string): Promise<boolean> {
    const { data, error } = await client.mfa.listFactors();
    // Unreadable factor list must not read as "no MFA": that would skip the second step.
    if (error || !data) throw fail(operation, error);
    return data.totp.some((f) => f.status === "verified");
  }

  return {
    signUp: (input) =>
      guard("signUp", async () => {
        const client = deps.stateless();
        const meta: Record<string, unknown> = { full_name: input.fullName };
        if (input.phone) meta.phone = input.phone;
        const { data, error } = await client.signUp({ email: input.email, password: input.password, options: { data: meta } });
        if (error) throw fail("signUp", error);
        if (data.session) {
          // Confirmation is meant to be required. A session here means it is switched off: fail closed.
          await closeLocal(client, "signUp");
          throw fail("signUp");
        }
        if (!data.user) throw fail("signUp");
        const alreadyRegistered = Array.isArray(data.user.identities) && data.user.identities.length === 0;
        return { userId: data.user.id, alreadyRegistered, verificationSent: true };
      }),

    signInWithPassword: (input) =>
      guard("signInWithPassword", async () => {
        const { data, error } = await request.signInWithPassword({ email: input.email, password: input.password });
        if (error) {
          if (error.code === "invalid_credentials") return { status: "invalid_credentials" as const };
          if (error.code === "email_not_confirmed") return { status: "email_not_verified" as const };
          throw fail("signInWithPassword", error);
        }
        if (!data.user || !data.session) throw fail("signInWithPassword");
        try {
          const mfaEnrolled = await hasVerifiedFactor(request, "signInWithPassword");
          return { status: "ok" as const, userId: data.user.id, mfaEnrolled };
        } catch (e) {
          await closeLocal(request, "signInWithPassword");
          throw e;
        }
      }),

    verifyPassword: (input) =>
      guard("verifyPassword", async () => {
        const { data: found, error: lookupError } = await admin.getUserById(input.userId);
        if (lookupError) throw fail("verifyPassword", lookupError);
        const email = found.user?.email;
        if (!email) return false;
        const client = deps.stateless();
        const result = await client.signInWithPassword({ email, password: input.password });
        try {
          if (result.error) {
            if (result.error.code === "invalid_credentials") return false;
            throw fail("verifyPassword", result.error);
          }
          return result.data.user?.id === input.userId;
        } finally {
          if (result.data.session) await closeLocal(client, "verifyPassword");
        }
      }),

    verifyTotp: (input) =>
      guard("verifyTotp", async () => {
        if (!/^\d{6}$/.test(input.code)) return false;
        const { data, error } = await request.mfa.listFactors();
        if (error || !data) throw fail("verifyTotp", error);
        const factor = data.totp.find((f) => f.status === "verified");
        if (!factor) return false;
        const result = await request.mfa.challengeAndVerify({ factorId: factor.id, code: input.code });
        if (result.error) {
          if (result.error.code === "mfa_verification_failed") return false;
          throw fail("verifyTotp", result.error);
        }
        return true;
      }),

    signOut: () =>
      guard("signOut", async () => {
        const { error } = await request.signOut({ scope: "local" });
        if (error) throw fail("signOut", error);
      }),

    signOutOthers: () =>
      guard("signOutOthers", async () => {
        const { error } = await request.signOut({ scope: "others" });
        if (error) throw fail("signOutOthers", error);
      }),

    requestPasswordReset: (input) =>
      guard("requestPasswordReset", async () => {
        const { error } = await deps.stateless().resetPasswordForEmail(input.email);
        if (error) throw fail("requestPasswordReset", error);
      }),

    resetPasswordWithToken: (input) =>
      guard("resetPasswordWithToken", async () => {
        const client = deps.stateless();
        let sessionOpen = false;
        try {
          const verified = await client.verifyOtp({ token_hash: input.token, type: "recovery" });
          sessionOpen = !!verified.data.session;
          if (verified.error) {
            const status = verified.error.status;
            // A client error means the link is invalid, expired or used. Anything else is an outage.
            if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) return { status: "invalid_token" as const };
            throw fail("resetPasswordWithToken", verified.error);
          }
          if (!verified.data.user) throw fail("resetPasswordWithToken");
          // The token is used up from here on, so any failure is an error, never "invalid token".
          const updated = await client.updateUser({ password: input.newPassword });
          if (updated.error) throw fail("resetPasswordWithToken", updated.error);
          return { status: "ok" as const, userId: verified.data.user.id };
        } finally {
          if (sessionOpen) await closeLocal(client, "resetPasswordWithToken");
        }
      }),

    updatePassword: (input) =>
      guard("updatePassword", async () => {
        const { error } = await admin.updateUserById(input.userId, { password: input.newPassword });
        if (error) throw fail("updatePassword", error);
      }),

    signOutEverywhere: (userId) => guard("signOutEverywhere", () => deps.revokeAllSessions(userId)),
  };
}
