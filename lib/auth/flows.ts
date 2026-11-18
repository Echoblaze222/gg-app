import { randomUUID } from "node:crypto";
import type { SbAuthExtras } from "./supabase-extras";

/**
 * Email confirmation and TOTP enrolment, on top of the cookie bound client. Both return plain values: no provider
 * text, no error detail. Callers choose the words the member sees.
 */

const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{8,200}$/;

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
