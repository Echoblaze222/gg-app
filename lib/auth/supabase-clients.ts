import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SbAuthExtras } from "./supabase-extras";
import type { SbAuth } from "./supabase-like";

/**
 * Client factories for the identity adapter. Both use the public key only. The service role key lives in
 * supabase-admin.ts and is never passed here.
 */
export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options: CookieOptions }>): void;
}

/** The slice of Next's cookie store that is used. */
export interface NextCookieStore {
  getAll(): Array<{ name: string; value: string }>;
  set(name: string, value: string, options?: CookieOptions): void;
}

/**
 * `writable` is true in route handlers and server actions, false in Server Components and anywhere else Next refuses
 * to set cookies. When false, nothing is written: a token refresh simply happens on the next write capable request.
 */
export function fromNextCookies(store: NextCookieStore, opts: { writable: boolean }): CookieAdapter {
  return {
    getAll: () => store.getAll(),
    setAll: (cookies) => {
      if (!opts.writable) return;
      for (const c of cookies) store.set(c.name, c.value, c.options);
    },
  };
}

function publicConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase client is not configured");
  return { url, key };
}

/** Bound to the current request's cookies. Create one per request. */
export function createRequestAuth(cookies: CookieAdapter): SbAuth {
  const { url, key } = publicConfig();
  const client = createServerClient(url, key, { cookies: { getAll: () => cookies.getAll(), setAll: (list) => cookies.setAll(list) } });
  return client.auth as unknown as SbAuth;
}

/** Same client as createRequestAuth, typed with the extra calls the confirmation route and MFA enrolment use. */
export function createRequestAuthFull(cookies: CookieAdapter): SbAuth & SbAuthExtras {
  const { url, key } = publicConfig();
  const client = createServerClient(url, key, { cookies: { getAll: () => cookies.getAll(), setAll: (list) => cookies.setAll(list) } });
  return client.auth as unknown as SbAuth & SbAuthExtras;
}

/** No cookies, nothing stored, nothing refreshed. Create a new one per operation. */
export function createStatelessAuth(): SbAuth {
  const { url, key } = publicConfig();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client.auth as unknown as SbAuth;
}
