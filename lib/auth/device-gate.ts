import type { SbError } from "./supabase-like";
import { IdentityProviderError } from "./supabase-identity";

/** Narrow view of public.device_sessions, looked up by the provider's session id. Runs with the service role. */
export interface DeviceDb {
  find(sessionId: string, memberId: string): Promise<{ data: { revoked_at: string | null } | null; error: SbError | null }>;
}

/**
 * True only when a device row for this session exists and was revoked. A session with no device row yet is not
 * revoked: revoking needs a row, and the row is created after sign in. A store failure throws, it never reads as "fine".
 */
export function createDeviceGate(deps: { db: DeviceDb }): { isRevoked(memberId: string, sessionId: string): Promise<boolean> } {
  return {
    async isRevoked(memberId: string, sessionId: string): Promise<boolean> {
      const { data, error } = await deps.db.find(sessionId, memberId).catch(() => {
        throw new IdentityProviderError("device.read");
      });
      if (error) throw new IdentityProviderError("device.read", error.code);
      return !!data && data.revoked_at !== null;
    },
  };
}
