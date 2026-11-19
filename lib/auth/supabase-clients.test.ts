// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created: { ssr: unknown[][]; js: unknown[][] } = { ssr: [], js: [] };
vi.mock("@supabase/ssr", () => ({ createServerClient: (...a: unknown[]) => { created.ssr.push(a); return { auth: { kind: "ssr" } }; } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => { created.js.push(a); return { auth: { kind: "js" } }; } }));

import { createRequestAuth, createStatelessAuth, fromNextCookies } from "./supabase-clients";

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
const saved = { ...process.env };

beforeEach(() => { created.ssr.length = 0; created.js.length = 0; Object.assign(process.env, ENV); });
afterEach(() => { process.env = { ...saved }; });

describe("client factories", () => {
  it("the request client uses the public key and the service role key never reaches it", () => {
    createRequestAuth({ getAll: () => [], setAll: () => {} });
    expect(created.ssr[0][0]).toBe("https://x.supabase.co");
    expect(created.ssr[0][1]).toBe("pub-key");
    expect(JSON.stringify(created.ssr)).not.toContain("service-key");
  });
  it("the request client reads and writes through the cookie adapter it was given", () => {
    const set: unknown[] = [];
    createRequestAuth({ getAll: () => [{ name: "a", value: "1" }], setAll: (c) => set.push(...c) });
    const cookies = (created.ssr[0][2] as { cookies: { getAll(): unknown; setAll(c: unknown[]): void } }).cookies;
    expect(cookies.getAll()).toEqual([{ name: "a", value: "1" }]);
    cookies.setAll([{ name: "b", value: "2", options: { path: "/" } }]);
    expect(set).toEqual([{ name: "b", value: "2", options: { path: "/" } }]);
  });
  it("the stateless client stores nothing, refreshes nothing, and uses the public key", () => {
    createStatelessAuth();
    expect(created.js[0][1]).toBe("pub-key");
    expect(created.js[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(JSON.stringify(created.js)).not.toContain("service-key");
  });
  it("every call makes a new stateless client", () => {
    createStatelessAuth(); createStatelessAuth();
    expect(created.js).toHaveLength(2);
  });
  it("falls back to the older anon key name", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    createStatelessAuth();
    expect(created.js[0][1]).toBe("anon-key");
  });
  it("throws a plain error when the public config is missing, without printing any key", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => createStatelessAuth()).toThrow("Supabase client is not configured");
    expect(() => createRequestAuth({ getAll: () => [], setAll: () => {} })).toThrow("Supabase client is not configured");
  });
});

describe("fromNextCookies", () => {
  const store = () => { const set: unknown[][] = []; return { set, s: { getAll: () => [{ name: "a", value: "1" }], set: (...a: unknown[]) => void set.push(a) } }; };
  it("writes cookies when writable, with their options", () => {
    const { s, set } = store();
    fromNextCookies(s, { writable: true }).setAll([{ name: "b", value: "2", options: { httpOnly: true } }]);
    expect(set).toEqual([["b", "2", { httpOnly: true }]]);
  });
  it("writes nothing when not writable (Server Components), but still reads", () => {
    const { s, set } = store();
    const a = fromNextCookies(s, { writable: false });
    a.setAll([{ name: "b", value: "2", options: {} }]);
    expect(set).toEqual([]);
    expect(a.getAll()).toEqual([{ name: "a", value: "1" }]);
  });
});
