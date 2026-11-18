/**
 * The narrow slice of supabase-js that the adapter and resolver use. Types only.
 * The real clients satisfy it structurally; tests pass fakes. Keeping it narrow means the adapter cannot reach
 * for anything it was not specified to use.
 */
export interface SbError {
  code?: string;
  status?: number;
  /** Provider text. Must never reach a caller, a log line or a response. */
  message: string;
}
export interface SbUser {
  id: string;
  email?: string;
  /** Empty list on a signup for an address that already has an account (to be proven, spec problem 1 of 3b). */
  identities?: unknown[] | null;
  /** Writable by the user. Never used for identity, roles or status. */
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}
export interface SbSession {
  access_token: string;
  user: SbUser;
}
export interface SbResult<T> {
  data: T;
  error: SbError | null;
}
export type SbFactor = { id: string; status: "verified" | "unverified" };

export interface SbAuth {
  signUp(args: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<SbResult<{ user: SbUser | null; session: SbSession | null }>>;
  signInWithPassword(args: { email: string; password: string }): Promise<SbResult<{ user: SbUser | null; session: SbSession | null }>>;
  /** With a jwt argument, asks the Auth server about exactly that token. */
  getUser(jwt?: string): Promise<SbResult<{ user: SbUser | null }>>;
  /** Cookie contents only. Not verified. Used to read the token, never to decide identity. */
  getSession(): Promise<SbResult<{ session: SbSession | null }>>;
  signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{ error: SbError | null }>;
  resetPasswordForEmail(email: string): Promise<{ error: SbError | null }>;
  verifyOtp(args: { token_hash: string; type: "recovery" }): Promise<SbResult<{ session: SbSession | null; user: SbUser | null }>>;
  updateUser(attrs: { password: string }): Promise<SbResult<{ user: SbUser | null }>>;
  mfa: {
    listFactors(): Promise<SbResult<{ totp: SbFactor[] } | null>>;
    challengeAndVerify(args: { factorId: string; code: string }): Promise<SbResult<unknown>>;
  };
}

export interface SbAdmin {
  getUserById(id: string): Promise<SbResult<{ user: SbUser | null }>>;
  updateUserById(id: string, attrs: { password: string }): Promise<SbResult<{ user: SbUser | null }>>;
}
