// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createReauthStore, REAUTH_WINDOW_SECONDS, type ReauthDb } from "./reauth-store";
import { IdentityProviderError } from "./supabase-identity";
import { makeCtx, MEMBER_ID } from "@/tests/security/fakes";
import { failed, fakeAuth, fakeJwt, ok, SECRET_TEXT, session, user } from "@/tests/security/supabase-fake";

const NOW = new Date("2026-11-17T10:00:00.000Z");
const at = (secondsFromNow: number) => new Date(NOW.getTime() + secondsFromNow * 1000).toISOString();

function build(opts: { windowSeconds?: number } = {}) {
  const fake = fakeAuth();
  const rows: Array<{ session_id: string; member_id: string; confirmed_at: string }> = [];
  const asked: Array<[string, string]> = [];
  const state = { upsertError: null as { code?: string; message: string } | null, getError: null as { code?: string; message: string } | null, throwOn: null as string | null };
  const db: ReauthDb = {
    async upsert(row) {
      if (state.throwOn === "upsert") throw new Error(SECRET_TEXT);
      if (state.upsertError) return { error: state.upsertError };
      const i = rows.findIndex((r) => r.session_id === row.session_id);
      if (i >= 0) rows[i] = row; else rows.push(row);
      return { error: null };
    },
    async get(sessionId, memberId) {
      asked.push([sessionId, memberId]);
      if (state.throwOn === "get") throw new Error(SECRET_TEXT);
      if (state.getError) return { data: null, error: state.getError };
      const r = rows.find((x) => x.session_id === sessionId && x.member_id === memberId);
      return { data: r ? { confirmed_at: r.confirmed_at } : null, error: null };
    },
  };
  const store = createReauthStore({ db, auth: fake.auth, now: () => NOW, windowSeconds: opts.windowSeconds });
  return { store, fake, rows, asked, state };
}

describe("reauth store: mark", () => {
  it("records the verified session, the member and the time", async () => {
    const t = build();
    await t.store.mark(makeCtx(), MEMBER_ID);
    expect(t.rows).toEqual([{ session_id: "sess-1", member_id: MEMBER_ID, confirmed_at: NOW.toISOString() }]);
  });
  it("records the session id from the verified token, whatever it is", async () => {
    const t = build();
    const u = user();
    t.fake.results.getSession = ok({ session: session(u, fakeJwt({ sub: u.id, session_id: "sess-9", aal: "aal1" })) });
    await t.store.mark(makeCtx(), MEMBER_ID);
    expect(t.rows).toEqual([{ session_id: "sess-9", member_id: MEMBER_ID, confirmed_at: NOW.toISOString() }]);
  });
  it("marking again moves the time and does not add a row", async () => {
    const t = build();
    await t.store.mark(makeCtx(), MEMBER_ID);
    await t.store.mark(makeCtx(), MEMBER_ID);
    expect(t.rows).toHaveLength(1);
  });
  it("refuses a member id that is not the person the session belongs to, and writes nothing", async () => {
    const t = build();
    await expect(t.store.mark(makeCtx(), "99999999-9999-4999-8999-999999999999")).rejects.toBeInstanceOf(IdentityProviderError);
    expect(t.rows).toHaveLength(0);
  });
  it("refuses when there is no valid session, and writes nothing", async () => {
    const t = build();
    t.fake.results.getUser = failed({ user: null }, "session_not_found", 403);
    await expect(t.store.mark(makeCtx(), MEMBER_ID)).rejects.toBeInstanceOf(IdentityProviderError);
    expect(t.rows).toHaveLength(0);
  });
  it("a provider outage throws without provider text", async () => {
    const t = build();
    t.fake.state.throwOn = "getUser";
    const e = await t.store.mark(makeCtx(), MEMBER_ID).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(IdentityProviderError);
    expect(JSON.stringify(e)).not.toContain(SECRET_TEXT);
  });
  it("a database error or failure throws without database text", async () => {
    for (const how of ["error", "throw"]) {
      const t = build();
      if (how === "error") t.state.upsertError = { code: "XX000", message: SECRET_TEXT }; else t.state.throwOn = "upsert";
      const e = await t.store.mark(makeCtx(), MEMBER_ID).then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(IdentityProviderError);
      expect((e as Error).message).not.toContain(SECRET_TEXT);
      expect(JSON.stringify(e)).not.toContain(SECRET_TEXT);
    }
  });
});

describe("reauth store: isRecent", () => {
  const seed = (t: ReturnType<typeof build>, confirmedAt: string, session = "sess-1", member = MEMBER_ID) => t.rows.push({ session_id: session, member_id: member, confirmed_at: confirmedAt });

  it("the window is ten minutes by default", () => {
    expect(REAUTH_WINDOW_SECONDS).toBe(600);
  });
  it("true inside the window, true exactly at its edge, false just past it", async () => {
    const t = build();
    seed(t, at(-30));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(true);
    t.rows.length = 0; seed(t, at(-600));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(true);
    t.rows.length = 0; seed(t, at(-601));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(false);
  });
  it("a custom window is honoured", async () => {
    const t = build({ windowSeconds: 60 });
    seed(t, at(-61));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(false);
  });
  it("false when there is no row", async () => {
    expect(await build().store.isRecent("sess-1", MEMBER_ID)).toBe(false);
  });
  it("a confirmation on another session or for another member does not count, and the lookup names both ids", async () => {
    const t = build();
    seed(t, at(-5), "sess-OTHER");
    seed(t, at(-5), "sess-1", "99999999-9999-4999-8999-999999999999");
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(false);
    expect(t.asked).toEqual([["sess-1", MEMBER_ID]]);
  });
  it("a time far in the future is refused, a small clock difference is tolerated", async () => {
    const t = build();
    seed(t, at(+300));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(false);
    t.rows.length = 0; seed(t, at(+10));
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(true);
  });
  it("an unreadable timestamp is false", async () => {
    const t = build();
    seed(t, "not a date");
    expect(await t.store.isRecent("sess-1", MEMBER_ID)).toBe(false);
  });
  it("a database error or failure throws, it never reads as recent", async () => {
    for (const how of ["error", "throw"]) {
      const t = build();
      seed(t, at(-5));
      if (how === "error") t.state.getError = { code: "XX000", message: SECRET_TEXT }; else t.state.throwOn = "get";
      const e = await t.store.isRecent("sess-1", MEMBER_ID).then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(IdentityProviderError);
      expect(JSON.stringify(e)).not.toContain(SECRET_TEXT);
    }
  });
});
