export { createAuthService } from "./service";
export type { AuthDeps } from "./service";
export { isPasswordAcceptable, normalizeNigerianPhone } from "./password";
export { RULES as AUTH_RATE_LIMITS } from "./rules";
export type { DeviceRecord, DeviceStore, IdentityProvider, ReauthStore, SignInOutcome } from "./types";
