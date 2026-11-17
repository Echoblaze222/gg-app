import type { SbAdmin, SbAuth, SbError, SbFactor, SbResult, SbSession, SbUser } from "@/lib/auth/supabase-like";
import { MEMBER_ID } from "@/tests/security/fakes";

export const SECRET_TEXT = "secret detail";

export function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "ES256", typ: "JWT" })}.${b64(claims)}.signature`;
}

export const ok = <T>(data: T): SbResult<T> => ({ data, error: null });
export const err = (code: string | undefined, status: number): { error: SbError } => ({ error: { code, status, message: SECRET_TEXT } });
export const failed = <T>(data: T, code: string | undefined, status: number): SbResult<T> => ({ data, error: err(code, status).error });

export const user = (over: Partial<SbUser> = {}): SbUser => ({ id: MEMBER_ID, email: "chidi@example.com", identities: [{}], ...over });
export const session = (u: SbUser = user(), token = fakeJwt({ sub: u.id, session_id: "sess-1", aal: "aal1" })): SbSession => ({ access_token: token, user: u });

export interface Call {
  method: string;
  args: unknown[];
}

/** Records every call. `throwOn` simulates a network failure with provider text in the message. */
export function fakeAuth() {
  const calls: Call[] = [];
  const state = { throwOn: null as string | null };
  const results = {
    signUp: ok({ user: user() as SbUser | null, session: null as SbSession | null }),
    signInWithPassword: ok({ user: user() as SbUser | null, session: session() as SbSession | null }),
    getUser: ok({ user: user() as SbUser | null }),
    getSession: ok({ session: session() as SbSession | null }),
    signOut: { error: null as SbError | null },
    resetPasswordForEmail: { error: null as SbError | null },
    verifyOtp: ok({ session: session() as SbSession | null, user: user() as SbUser | null }),
    updateUser: ok({ user: user() as SbUser | null }),
    listFactors: ok({ totp: [] as SbFactor[] } as { totp: SbFactor[] } | null),
    challengeAndVerify: ok<unknown>({}),
  };
  const enter = (method: string, args: unknown[]) => {
    calls.push({ method, args });
    if (state.throwOn === method) throw new Error(SECRET_TEXT);
  };
  const auth: SbAuth = {
    async signUp(a) { enter("signUp", [a]); return results.signUp; },
    async signInWithPassword(a) { enter("signInWithPassword", [a]); return results.signInWithPassword; },
    async getUser(jwt) { enter("getUser", [jwt]); return results.getUser; },
    async getSession() { enter("getSession", []); return results.getSession; },
    async signOut(o) { enter("signOut", [o]); return results.signOut; },
    async resetPasswordForEmail(e) { enter("resetPasswordForEmail", [e]); return results.resetPasswordForEmail; },
    async verifyOtp(a) { enter("verifyOtp", [a]); return results.verifyOtp; },
    async updateUser(a) { enter("updateUser", [a]); return results.updateUser; },
    mfa: {
      async listFactors() { enter("listFactors", []); return results.listFactors; },
      async challengeAndVerify(a) { enter("challengeAndVerify", [a]); return results.challengeAndVerify; },
    },
  };
  return { auth, calls, results, state, names: () => calls.map((c) => c.method) };
}
export type FakeAuth = ReturnType<typeof fakeAuth>;

export function fakeAdmin() {
  const calls: Call[] = [];
  const state = { throwOn: null as string | null };
  const results = {
    getUserById: ok({ user: user() as SbUser | null }),
    updateUserById: ok({ user: user() as SbUser | null }),
  };
  const enter = (method: string, args: unknown[]) => {
    calls.push({ method, args });
    if (state.throwOn === method) throw new Error(SECRET_TEXT);
  };
  const admin: SbAdmin = {
    async getUserById(id) { enter("getUserById", [id]); return results.getUserById; },
    async updateUserById(id, attrs) { enter("updateUserById", [id, attrs]); return results.updateUserById; },
  };
  return { admin, calls, results, state };
}
export type FakeAdmin = ReturnType<typeof fakeAdmin>;
