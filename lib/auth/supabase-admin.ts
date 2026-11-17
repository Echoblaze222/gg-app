import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SbAdmin } from "./supabase-like";
import { IdentityProviderError } from "./supabase-identity";
import type { ReauthDb } from "./reauth-store";
import type { DeviceDb } from "./device-gate";

export interface SupabaseAdmin {
  admin: SbAdmin;
  revokeAllSessions(userId: string): Promise<void>;
  /** public.session_reauth, service role only. */
  reauthDb: ReauthDb;
  /** public.device_sessions looked up by the provider session id. */
  deviceDb: DeviceDb;
}

/**
 * The only place the service role key is read. Server only: the import above makes the build fail if a client
 * component pulls this module in. The key lives in a non-public env var and is never logged or returned.
 */
export function createSupabaseAdmin(): SupabaseAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin client is not configured");

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  return {
    admin: client.auth.admin,
    async revokeAllSessions(userId: string) {
      // SQL function, service_role only (spec problem 2). Deletes the user's auth.sessions rows.
      const { error } = await client.rpc("revoke_all_sessions", { target_user_id: userId });
      if (error) throw new IdentityProviderError("signOutEverywhere", error.code);
    },
    reauthDb: {
      async upsert(row) {
        const { error } = await client.from("session_reauth").upsert(row, { onConflict: "session_id" });
        return { error };
      },
      async get(sessionId, memberId) {
        const { data, error } = await client.from("session_reauth").select("confirmed_at").eq("session_id", sessionId).eq("member_id", memberId).maybeSingle();
        return { data, error };
      },
    },
    deviceDb: {
      async find(sessionId, memberId) {
        const { data, error } = await client.from("device_sessions").select("revoked_at").eq("session_id", sessionId).eq("member_id", memberId).maybeSingle();
        return { data, error };
      },
    },
  };
}
