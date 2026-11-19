// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSessionResolver } from "./session-resolver";
import { IdentityProviderError } from "./supabase-identity";
import { fakeLogger, makeCtx, MEMBER_ID } from "@/tests/security/fakes";
import { failed, fakeAuth, fakeJwt, ok, SECRET_TEXT, session, user } from "@/tests/security/supabase-fake";

interface Opts {
  claims?: Record<string, unknown>;
  userOver?: Parameters<typeof user>[0];
  recentFor?: string[];
  revoked?: boolean;
  reauthThrows?: boolean;
  devicesThrow?: boolean;
}

function build(o: Opts = {}) {
  const fake = fakeAuth();
  const claims = { sub: MEMBER_ID, session_id: "sess-1", aal: "aal1", ...o.claims };
  const token = fakeJwt(claims);
  const u = user(o.userOver);
  fake.results.getSession = ok({ session: session(u, token) });
  fake.results.getUser = ok({ user: u });
  const asked: Array<[string, string]> = [];
  const resolver = createSessionResolver({
    auth: fake.auth,
    reauth: {
      isRecent: async (sessionId, memberId) => {
        asked.push([sessionId, memberId]);
        if (o.reauthThrows) throw new Error(SECRET_TEXT);
        return (o.recentFor ?? []).includes(sessionId);
      },
    },
    devices: {
      isRevoked: async () => {
        if (o.devicesThrow) throw new Error(SECRET_TEXT);
        return o.revoked ?? false;
      },
    },
    logger: fakeLogger(),
  });
  return { resolver, fake, token, asked };
}

describe("session resolver", () => {
  it("resolves a live session into facts", async () => {
    const t = build({ recentFor: ["sess-1"] });
    expect(await t.resolver.resolve(makeCtx())).toEqual({ memberId: MEMBER_ID, sessionId: "sess-1", mfaVerified: false, recentlyReauthenticated: true });
  });
  it("B12 no cookie session gives null without asking the Auth server", async () => {
    const t = build();
    t.fake.results.getSession = ok({ session: null });
    expect(await t.resolver.resolve(makeCtx())).toBeNull();
    expect(t.fake.names()).not.toContain("getUser");
  });
  it("B12 asks the Auth server about exactly the token it will read claims from", async () => {
    const t = build();
    await t.resolver.resolve(makeCtx());
    expect(t.fake.calls.find((c) => c.method === "getUser")?.args[0]).toBe(t.token);
  });
  it("B12 a tampered, expired or revoked token gives null", async () => {
    for (const [code, status] of [["bad_jwt", 401], ["session_not_found", 403], ["user_not_found", 403]] as const) {
      const t = build();
      t.fake.results.getUser = failed({ user: null }, code, status);
      expect(await t.resolver.resolve(makeCtx())).toBeNull();
    }
  });
  it("B12 a missing user without an error gives null", async () => {
    const t = build();
    t.fake.results.getUser = ok({ user: null });
    expect(await t.resolver.resolve(makeCtx())).toBeNull();
  });
  it("B13 identity is the verified user id, and metadata is ignored", async () => {
    const t = build({ userOver: { user_metadata: { role: "owner", member_id: "someone-else", aal: "aal2" }, app_metadata: { role: "owner" } } });
    expect(await t.resolver.resolve(makeCtx())).toMatchObject({ memberId: MEMBER_ID, mfaVerified: false });
  });
  it("B13 a token whose subject differs from the verified user gives null", async () => {
    const t = build({ claims: { sub: "99999999-9999-4999-8999-999999999999" } });
    expect(await t.resolver.resolve(makeCtx())).toBeNull();
  });
  it("B14 mfaVerified is true only for aal2 in the token", async () => {
    expect((await build({ claims: { aal: "aal2" } }).resolver.resolve(makeCtx()))?.mfaVerified).toBe(true);
    expect((await build({ claims: { aal: "aal1" } }).resolver.resolve(makeCtx()))?.mfaVerified).toBe(false);
    expect((await build({ claims: { aal: undefined } }).resolver.resolve(makeCtx()))?.mfaVerified).toBe(false);
    expect((await build({ claims: { aal: "AAL2" } }).resolver.resolve(makeCtx()))?.mfaVerified).toBe(false);
  });
  it("B15 a reauth on another session does not carry over, and the store is asked about this session and member", async () => {
    const t = build({ recentFor: ["sess-OTHER"] });
    expect((await t.resolver.resolve(makeCtx()))?.recentlyReauthenticated).toBe(false);
    expect(t.asked).toEqual([["sess-1", MEMBER_ID]]);
  });
  it("B15 the session id asked about is the token's own, whatever it is", async () => {
    const other = build({ claims: { session_id: "sess-2" }, recentFor: ["sess-1"] });
    expect(await other.resolver.resolve(makeCtx())).toMatchObject({ sessionId: "sess-2", recentlyReauthenticated: false });
    expect(other.asked).toEqual([["sess-2", MEMBER_ID]]);
    const own = build({ claims: { session_id: "sess-2" }, recentFor: ["sess-2"] });
    expect(await own.resolver.resolve(makeCtx())).toMatchObject({ sessionId: "sess-2", recentlyReauthenticated: true });
  });
  it("a token without a session id is treated as invalid (fail closed)", async () => {
    const t = build({ claims: { session_id: undefined } });
    expect(await t.resolver.resolve(makeCtx())).toBeNull();
    expect(t.asked).toHaveLength(0);
  });
  it("B16 a revoked device gives null even though the provider session is alive", async () => {
    expect(await build({ revoked: true }).resolver.resolve(makeCtx())).toBeNull();
  });
  it("B17 a provider outage throws, it never reads as signed out", async () => {
    const a = build();
    a.fake.results.getUser = failed({ user: null }, undefined, 503);
    await expect(a.resolver.resolve(makeCtx())).rejects.toBeInstanceOf(IdentityProviderError);
    const b = build();
    b.fake.state.throwOn = "getUser";
    await expect(b.resolver.resolve(makeCtx())).rejects.toBeInstanceOf(IdentityProviderError);
  });
  it("B17 a store failure throws without provider or store text", async () => {
    for (const o of [{ reauthThrows: true }, { devicesThrow: true }]) {
      const e = await build(o).resolver.resolve(makeCtx()).then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(IdentityProviderError);
      expect(JSON.stringify(e)).not.toContain(SECRET_TEXT);
      expect((e as Error).message).not.toContain(SECRET_TEXT);
    }
  });
  it("the store and device checks only run after the Auth server has confirmed the session", async () => {
    const t = build();
    t.fake.results.getUser = failed({ user: null }, "session_not_found", 403);
    await t.resolver.resolve(makeCtx());
    expect(t.asked).toHaveLength(0);
  });
});
