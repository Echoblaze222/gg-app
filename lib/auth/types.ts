import type { RequestContext } from "@/contracts/services";
import type { Uuid } from "@/contracts/entities";

export type SignInOutcome =
  | { status: "ok"; userId: Uuid; /** True when the user has a second factor and must complete it. */ mfaEnrolled: boolean }
  | { status: "invalid_credentials" }
  | { status: "email_not_verified" };

/**
 * Thin boundary over the identity provider (Supabase Auth). The service holds all the rules, the adapter only
 * translates. Adapters throw on infrastructure failure and never return provider error text.
 * Methods without a user id act on the current request's session.
 */
export interface IdentityProvider {
  signUp(input: { email: string; password: string; fullName: string; phone?: string }): Promise<{ userId: Uuid; alreadyRegistered: boolean; verificationSent: boolean }>;
  signInWithPassword(input: { email: string; password: string }): Promise<SignInOutcome>;
  /** Checks a password without creating a session. */
  verifyPassword(input: { userId: Uuid; password: string }): Promise<boolean>;
  /** Completes the second factor for the current session. */
  verifyTotp(input: { code: string }): Promise<boolean>;
  signOut(): Promise<void>;
  signOutOthers(): Promise<void>;
  requestPasswordReset(input: { email: string }): Promise<void>;
  resetPasswordWithToken(input: { token: string; newPassword: string }): Promise<{ status: "ok"; userId: Uuid } | { status: "invalid_token" }>;
  updatePassword(input: { userId: Uuid; newPassword: string }): Promise<void>;
  /** Ends every session of the user. */
  signOutEverywhere(userId: Uuid): Promise<void>;
}

export interface DeviceRecord {
  id: Uuid;
  memberId: Uuid;
  sessionId: string;
  deviceLabel: string;
  ip: string | null;
  lastSeenAt: string;
}

/** Subset of the DeviceSessionRepository contract request (docs/handoffs). */
export interface DeviceStore {
  listActiveByMember(memberId: Uuid): Promise<DeviceRecord[]>;
  /** False when the device does not exist or does not belong to the member. */
  revoke(memberId: Uuid, deviceId: Uuid): Promise<boolean>;
}

/** Records that the session recently confirmed its password. The session resolver reads the same store. */
export interface ReauthStore {
  mark(ctx: RequestContext, memberId: Uuid): Promise<void>;
}
