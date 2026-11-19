// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const log: { create: unknown[][]; calls: Array<[string, unknown[]]> } = { create: [], calls: [] };
const result = { rpc: { error: null as null | { code?: string; message: string } }, get: { data: null as unknown, error: null as unknown } };
function chain(table: string) {
  const c: Record<string, unknown> = {
    upsert: async (...a: unknown[]) => { log.calls.push([`${table}.upsert`, a]); return { error: null }; },
    select: (...a: unknown[]) => { log.calls.push([`${table}.select`, a]); return c; },
    eq: (...a: unknown[]) => { log.calls.push([`${table}.eq`, a]); return c; },
    maybeSingle: async () => result.get,
  };
  return c;
}
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => { log.create.push(a); return { auth: { admin: { kind: "admin" } }, from: (t: string) => chain(t), rpc: async (...r: unknown[]) => { log.calls.push(["rpc", r]); return result.rpc; } }; },
}));

import { createSupabaseAdmin } from "./supabase-admin";
import { IdentityProviderError } from "./supabase-identity";

const saved = { ...process.env };
beforeEach(() => { log.create.length = 0; log.calls.length = 0; result.rpc.error = null; Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" }); });
afterEach(() => { process.env = { ...saved }; });

describe("admin client", () => {
  it("uses the service role key with no session storage", () => {
    createSupabaseAdmin();
    expect(log.create[0][1]).toBe("service-key");
    expect(log.create[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it("throws a plain error when not configured, without printing the key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseAdmin()).toThrow("Supabase admin client is not configured");
  });
  it("revokeAllSessions calls the SQL function with the user id", async () => {
    await createSupabaseAdmin().revokeAllSessions("u1");
    expect(log.calls).toContainEqual(["rpc", ["revoke_all_sessions", { target_user_id: "u1" }]]);
  });
  it("revokeAllSessions throws IdentityProviderError without database text on an error", async () => {
    result.rpc.error = { code: "XX000", message: "secret detail" };
    const e = await createSupabaseAdmin().revokeAllSessions("u1").then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(IdentityProviderError);
    expect(JSON.stringify(e)).not.toContain("secret detail");
  });
  it("reauth rows are upserted on the session id", async () => {
    const row = { session_id: "s1", member_id: "m1", confirmed_at: "2026-11-17T10:00:00.000Z" };
    await createSupabaseAdmin().reauthDb.upsert(row);
    expect(log.calls).toContainEqual(["session_reauth.upsert", [row, { onConflict: "session_id" }]]);
  });
  it("reauth and device lookups filter on both session id and member id", async () => {
    const a = createSupabaseAdmin();
    await a.reauthDb.get("s1", "m1");
    await a.deviceDb.find("s1", "m1");
    for (const t of ["session_reauth", "device_sessions"]) {
      expect(log.calls).toContainEqual([`${t}.eq`, ["session_id", "s1"]]);
      expect(log.calls).toContainEqual([`${t}.eq`, ["member_id", "m1"]]);
    }
  });
});
