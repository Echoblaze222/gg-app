import type { ExtendedRateLimitRule } from "@/lib/security/rate-limit";

/**
 * Address limits are loose on purpose: many mobile users share one carrier address.
 * Account limits are tight and keyed on the typed email, so unknown emails behave like real ones.
 */
export const RULES = {
  register: { name: "auth_register", limit: 30, accountLimit: 3, windowSeconds: 3600 },
  login: { name: "auth_login", limit: 60, accountLimit: 10, windowSeconds: 900 },
  mfaVerify: { name: "auth_mfa", limit: 60, accountLimit: 5, windowSeconds: 300 },
  passwordResetRequest: { name: "auth_reset_request", limit: 30, accountLimit: 3, windowSeconds: 3600 },
  passwordResetConfirm: { name: "auth_reset_confirm", limit: 30, windowSeconds: 900 },
  reauth: { name: "auth_reauth", limit: 60, accountLimit: 5, windowSeconds: 900 },
} as const satisfies Record<string, ExtendedRateLimitRule>;
