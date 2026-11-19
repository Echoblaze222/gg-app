import { AppError } from "@/contracts/errors";
import type { AppErrorShape } from "@/contracts/errors";
import type { PermissionName } from "@/contracts/permissions";
import type { AuthorizationService, RequestContext, SessionInfo } from "@/contracts/services";

export type Access =
  | { kind: "granted"; session: SessionInfo; allowed: ReadonlySet<PermissionName> }
  | { kind: "denied"; error: AppErrorShape }
  /** Session expired, MFA or reauthentication needed: the person must go through sign in, not see a forbidden page. */
  | { kind: "sign_in"; error: AppErrorShape };

const SIGN_IN_CODES = new Set(["AUTH_SESSION_EXPIRED", "AUTH_MFA_REQUIRED", "AUTH_MFA_INVALID", "AUTH_EMAIL_NOT_VERIFIED"]);

/**
 * Checks `required` first (the gate for the whole screen), then every optional permission, so cards a role may not see are
 * left out instead of shown as errors. The server decides, the UI only reflects it.
 */
export async function resolveAccess(
  authorization: AuthorizationService,
  ctx: RequestContext,
  required: PermissionName,
  optional: readonly PermissionName[] = [],
): Promise<Access> {
  let gate;
  try {
    gate = await authorization.requirePermission(ctx, required);
  } catch {
    return { kind: "denied", error: new AppError("INTERNAL", { reference: ctx.requestId }).toShape() };
  }
  if (!gate.ok) return SIGN_IN_CODES.has(gate.error.code) ? { kind: "sign_in", error: gate.error } : { kind: "denied", error: gate.error };

  const allowed = new Set<PermissionName>([required]);
  const checks = await Promise.all(
    optional.map(async (p) => {
      try {
        const r = await authorization.requirePermission(ctx, p);
        return r.ok ? p : null;
      } catch {
        return null;
      }
    }),
  );
  for (const p of checks) if (p) allowed.add(p);
  return { kind: "granted", session: gate.value, allowed };
}
