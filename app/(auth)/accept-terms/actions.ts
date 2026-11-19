"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppError } from "@/contracts/errors";
import { authLogger, readCurrentPolicyIds } from "@/lib/auth/composition";
import { readVerifiedSession } from "@/lib/auth/session-resolver";
import { createSupabaseAdmin } from "@/lib/auth/supabase-admin";
import { createRequestAuthFull, fromNextCookies } from "@/lib/auth/supabase-clients";
import { createAuthRepositories } from "@/lib/db/auth-repositories";
import { createAuditService } from "@/lib/security/audit";
import { buildRequestContext } from "../auth-gateway";
import { stateFromError, validationState, type AuthFormState } from "../form-state";

/** Records that the signed in member accepted the current terms and privacy policy, then continues. Used after Google sign up. */
export async function acceptTermsAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = prev.status === "error" ? prev.attempt + 1 : 1;
  if (formData.get("acceptTerms") !== "on") {
    return validationState({ acceptTerms: "Please accept the terms and the privacy policy to continue." }, attempt);
  }

  const ctx = await buildRequestContext();
  const unavailable = () => stateFromError(new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape(), attempt);
  try {
    const auth = createRequestAuthFull(fromNextCookies(await cookies(), { writable: true }));
    const session = await readVerifiedSession(auth);
    if (!session) redirect("/login");

    const repos = createAuthRepositories(createSupabaseAdmin().client);
    // The versions are chosen here, on the server. Nothing in the form says which ones.
    const policyIds = await readCurrentPolicyIds(repos.policies);
    if (policyIds.length === 0) return unavailable();
    for (const policyVersionId of policyIds) {
      await repos.policies.accept({ memberId: session.userId, policyVersionId, ip: ctx.ip });
    }
    await createAuditService({ audit: repos.audit, logger: authLogger })
      .record({ ...ctx, actorId: session.userId }, { action: "auth.terms_accepted", result: "success" })
      .catch((err: unknown) => authLogger.error("terms_audit_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" }));
  } catch (err) {
    // redirect() throws a control flow signal on purpose: let it through.
    if (err instanceof Error && "digest" in err && String((err as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
    authLogger.error("accept_terms_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    return unavailable();
  }
  redirect("/app");
}
