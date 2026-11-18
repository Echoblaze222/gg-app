import { randomUUID } from "node:crypto";
import type { SbAuthExtras } from "./supabase-extras";

/**
 * Email confirmation, Google sign in and TOTP enrolment, on top of the cookie bound client. All return plain values: no
 * provider text, no error detail. Callers choose the words the member sees.
 */

const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{8,200}$/;
const OAUTH_CODE_RE = /^[A-Za-z0-9._-]{8,200}$/;

/**
 * Confirms the address from an emailed link. The link only proves the address, so the session it opens is ended at once:
 * signing in still needs the password (and the second factor, where one is set).
 */
export async function confirmEmailToken(auth: SbAuthExtras, input: { tokenHash: string; type: string }): Promise<boolean> {
  if (!TOKEN_HASH_RE.test(input.tokenHash)) return false;
  if (input.type !== "signup" && input.type !== "email") return false;
  const { data, error } = await auth.verifyOtp({ token_hash: input.tokenHash, type: input.type });
  if (error || !data.user) return false;
  await auth.signOut({ scope: "local" });
  return true;
}

/** The address to send the browser to for Google, or null when Google is not switched on for the project. */
export async function startGoogleOAuth(auth: SbAuthExtras, input: { redirectTo: string }): Promise<string | null> {
  const { data, error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: input.redirectTo, queryParams: { prompt: "select_account" } } });
  if (error || !data.url || !data.url.startsWith("https://")) return null;
  return data.url;
}

/** Trades the one time code Google sent back for a session cookie. */
export async function exchangeOAuthCode(auth: SbAuthExtras, code: string): Promise<boolean> {
  if (!OAUTH_CODE_RE.test(code)) return false;
  const { data, error } = await auth.exchangeCodeForSession(code);
  return !error && Boolean(data.user);
}

export type PostGoogleStep = "/accept-terms" | "/mfa" | "/app";

/**
 * Where a member goes right after Google sign in. A new Google account skips the sign up form, so the terms come first:
 * the account may not be used until the current terms and privacy policy are accepted. Then a second factor, if one is set.
 */
export async function nextStepAfterGoogle(deps: { verifiedTotpCount(): Promise<number>; acceptedCurrentPolicies(): Promise<boolean> }): Promise<PostGoogleStep> {
  if (!(await deps.acceptedCurrentPolicies())) return "/accept-terms";
  if ((await deps.verifiedTotpCount()) > 0) return "/mfa";
  return "/app";
}

export interface TotpEnrolment {
  factorId: string;
  secret: string;
  uri: string;
  /** SVG markup from the provider, to render as an image source (data URI), never as HTML. */
  qrSvg: string;
}

/** Starts a new authenticator app enrolment. An abandoned, never confirmed factor from an earlier try is removed first. */
export async function startTotpEnrolment(auth: SbAuthExtras): Promise<TotpEnrolment | null> {
  const listed = await auth.mfa.listFactors();
  if (listed.error) return null;
  for (const factor of listed.data?.totp ?? []) {
    if (factor.status === "unverified") await auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `app-${randomUUID().slice(0, 8)}` });
  if (error || !data) return null;
  return { factorId: data.id, secret: data.totp.secret, uri: data.totp.uri, qrSvg: data.totp.qr_code };
}

/** Confirms the first code from the authenticator app. The factor only counts once this succeeds. */
export async function confirmTotpEnrolment(auth: SbAuthExtras, input: { factorId: string; code: string }): Promise<boolean> {
  const { error } = await auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
  return !error;
}
