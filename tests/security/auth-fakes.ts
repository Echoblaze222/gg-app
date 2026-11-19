/** Test doubles for AuthService tests. Only imported from tests. */
import type { PolicyRepository } from "@/contracts/repositories";
import type { PolicyVersion } from "@/contracts/entities";
import type { RequestContext } from "@/contracts/services";
import type { DeviceRecord, DeviceStore, IdentityProvider, ReauthStore, SignInOutcome } from "@/lib/auth/types";
import { MEMBER_ID } from "./fakes";

export const TERMS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const PRIVACY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export interface FakeIdentity extends IdentityProvider {
  calls: string[];
  config: {
    signIn: SignInOutcome;
    alreadyRegistered: boolean;
    passwordOk: boolean;
    totpOk: boolean;
    resetTokenOk: boolean;
    throwOn: string | null;
  };
}

export function fakeIdentity(over: Partial<FakeIdentity["config"]> = {}): FakeIdentity {
  const calls: string[] = [];
  const config = { signIn: { status: "ok", userId: MEMBER_ID, mfaEnrolled: false } as SignInOutcome, alreadyRegistered: false, passwordOk: true, totpOk: true, resetTokenOk: true, throwOn: null as string | null, ...over };
  const hit = (name: string) => {
    calls.push(name);
    if (config.throwOn === name) throw new Error(`provider failure with secret detail in ${name}`);
  };
  return {
    calls,
    config,
    signUp: async () => { hit("signUp"); return { userId: MEMBER_ID, alreadyRegistered: config.alreadyRegistered, verificationSent: true }; },
    signInWithPassword: async () => { hit("signIn"); return config.signIn; },
    verifyPassword: async () => { hit("verifyPassword"); return config.passwordOk; },
    verifyTotp: async () => { hit("verifyTotp"); return config.totpOk; },
    signOut: async () => { hit("signOut"); },
    signOutOthers: async () => { hit("signOutOthers"); },
    requestPasswordReset: async () => { hit("requestPasswordReset"); },
    resetPasswordWithToken: async () => { hit("resetPassword"); return config.resetTokenOk ? { status: "ok" as const, userId: MEMBER_ID } : { status: "invalid_token" as const }; },
    updatePassword: async () => { hit("updatePassword"); },
    signOutEverywhere: async () => { hit("signOutEverywhere"); },
  };
}

export function fakePolicies(opts: { published?: boolean; acceptFails?: boolean } = {}): PolicyRepository & { accepted: string[] } {
  const accepted: string[] = [];
  const published = opts.published ?? true;
  const v = (id: string, kind: PolicyVersion["kind"]) => ({ id, kind, version: "1", body: "", draft: false, publishedAt: "2026-01-01T00:00:00Z" }) as PolicyVersion;
  return {
    accepted,
    getLatest: async (kind) => (!published ? null : kind === "terms" ? v(TERMS_ID, "terms") : kind === "privacy" ? v(PRIVACY_ID, "privacy") : null),
    listVersions: async () => [],
    accept: async (input) => { if (opts.acceptFails) throw new Error("db"); accepted.push(input.policyVersionId); return {} as never; },
    listAcceptances: async () => [],
  };
}

export function fakeDevices(rows: DeviceRecord[] = []): DeviceStore & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    listActiveByMember: async (memberId) => rows.filter((r) => r.memberId === memberId),
    revoke: async (memberId, deviceId) => {
      const row = rows.find((r) => r.id === deviceId && r.memberId === memberId);
      if (!row) return false;
      revoked.push(deviceId);
      return true;
    },
  };
}

export function fakeReauth(): ReauthStore & { marked: string[] } {
  const marked: string[] = [];
  return { marked, mark: async (_ctx: RequestContext, memberId: string) => { marked.push(memberId); } };
}
