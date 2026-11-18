"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { otpSchema } from "@/contracts/schemas";
import { authLogger } from "@/lib/auth/composition";
import { confirmTotpEnrolment, startTotpEnrolment } from "@/lib/auth/flows";
import { readVerifiedSession } from "@/lib/auth/session-resolver";
import { createSupabaseAdmin } from "@/lib/auth/supabase-admin";
import { createRequestAuthFull, fromNextCookies } from "@/lib/auth/supabase-clients";
import { createAuthRepositories } from "@/lib/db/auth-repositories";
import { createAuditService } from "@/lib/security/audit";
import { buildRequestContext } from "../../auth-gateway";

export type MfaSetupState =
  | { status: "idle" }
  | { status: "ready"; factorId: string; secret: string; uri: string; qrSvg: string }
  | { status: "done" }
  | { status: "error"; message: string; reference: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(message: string, reference: string): MfaSetupState {
  return { status: "error", message, reference };
}

async function signedIn() {
  const auth = createRequestAuthFull(fromNextCookies(await cookies(), { writable: true }));
  const session = await readVerifiedSession(auth);
  return { auth, session };
}

/** Step 1: create the authenticator app secret for the signed in member. */
export async function startMfaEnrolAction(): Promise<MfaSetupState> {
  const ctx = await buildRequestContext();
  try {
    const { auth, session } = await signedIn();
    if (!session) return failure("Log in first, then set up the authenticator app.", ctx.requestId);
    const enrolment = await startTotpEnrolment(auth);
    if (!enrolment) return failure("We could not start the setup. Try again in a moment.", ctx.requestId);
    return { status: "ready", ...enrolment };
  } catch (err) {
    authLogger.error("mfa_enrol_start_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    return failure("We could not start the setup. Try again in a moment.", ctx.requestId);
  }
}

/** Step 2: the member types the first code from the app. The factor counts only after this succeeds. */
export async function confirmMfaEnrolAction(_prev: MfaSetupState, formData: FormData): Promise<MfaSetupState> {
  const ctx = await buildRequestContext();
  const factorId = formData.get("factorId");
  const code = otpSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (typeof factorId !== "string" || !UUID_RE.test(factorId) || !code.success) {
    return failure("Enter the 6 digit code from your authenticator app.", ctx.requestId);
  }
  try {
    const { auth, session } = await signedIn();
    if (!session) return failure("Log in first, then set up the authenticator app.", ctx.requestId);
    const ok = await confirmTotpEnrolment(auth, { factorId, code: code.data });
    if (!ok) return failure("That code did not work. Check the time on your phone and try the next code.", ctx.requestId);
    try {
      const audit = createAuditService({ audit: createAuthRepositories(createSupabaseAdmin().client).audit, logger: authLogger });
      await audit.record({ ...ctx, actorId: session.userId }, { action: "auth.mfa_enrolled", result: "success" });
    } catch (err) {
      authLogger.error("mfa_enrol_audit_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    }
    return { status: "done" };
  } catch (err) {
    authLogger.error("mfa_enrol_confirm_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    return failure("We could not finish the setup. Try again in a moment.", randomUUID());
  }
}
