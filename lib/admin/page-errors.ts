import type { AppErrorShape, ErrorCode } from "../../contracts/errors";

/**
 * The ways an admin page can fail to show its data, shared by every admin screen so they all behave the same.
 * - redirect: the browser must go sign in or enter a code.
 * - blocked: signed in, but not allowed here or not in good standing. A retry would not help.
 * - failed: something broke. The admin pages only read data, so a retry is always safe.
 */
export type AdminProblem =
  | { readonly kind: "redirect"; readonly to: "/login" | "/mfa" }
  | { readonly kind: "blocked"; readonly error: AppErrorShape }
  | { readonly kind: "failed"; readonly error: AppErrorShape };

const BLOCKED_CODES: readonly ErrorCode[] = ["PERMISSION_DENIED", "AUTH_ACCOUNT_SUSPENDED", "AUTH_EMAIL_NOT_VERIFIED"];

export function classifyAdminError(error: AppErrorShape): AdminProblem {
  if (error.code === "AUTH_SESSION_EXPIRED") {
    return { kind: "redirect", to: "/login" };
  }
  if (error.code === "AUTH_MFA_REQUIRED") {
    return { kind: "redirect", to: "/mfa" };
  }
  if (BLOCKED_CODES.includes(error.code)) {
    return { kind: "blocked", error };
  }
  return { kind: "failed", error };
}
