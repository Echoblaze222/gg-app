import type { SbError, SbResult, SbSession, SbUser } from "./supabase-like";

/**
 * The extra slice of supabase-js used by the email confirmation route, Google sign in and MFA enrolment. Types only, like
 * supabase-like.ts. Kept apart so the identity adapter's narrow type, and the fakes its tests use, stay as they are.
 */
export interface SbTotpEnrolment {
  id: string;
  type: "totp";
  totp: { qr_code: string; secret: string; uri: string };
}

export interface SbAuthExtras {
  verifyOtp(args: { token_hash: string; type: "signup" | "email" }): Promise<SbResult<{ session: SbSession | null; user: SbUser | null }>>;
  signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{ error: SbError | null }>;
  signInWithOAuth(args: { provider: "google"; options?: { redirectTo?: string; queryParams?: Record<string, string> } }): Promise<SbResult<{ provider: string; url: string | null }>>;
  exchangeCodeForSession(code: string): Promise<SbResult<{ session: SbSession | null; user: SbUser | null }>>;
  mfa: {
    enroll(args: { factorType: "totp"; friendlyName?: string }): Promise<SbResult<SbTotpEnrolment | null>>;
    challengeAndVerify(args: { factorId: string; code: string }): Promise<SbResult<unknown>>;
    unenroll(args: { factorId: string }): Promise<SbResult<unknown>>;
    listFactors(): Promise<SbResult<{ totp: Array<{ id: string; status: "verified" | "unverified" }> } | null>>;
  };
}
