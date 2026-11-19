// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";
import { fakeLogger, fakeRateRepo, fakeSecurityEvents, makeCtx } from "@/tests/security/fakes";

const SECRET = "x".repeat(40);
const rule = { name: "login", limit: 3, windowSeconds: 60 };
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function build(o: { repoFails?: boolean; eventsFail?: boolean } = {}) {
  const repo = fakeRateRepo({ fail: o.repoFails });
  const events = fakeSecurityEvents({ fail: o.eventsFail });
  const logger = fakeLogger();
  const limiter = createRateLimiter({ limits: repo, events, hmacSecret: SECRET, logger });
  return { limiter, repo, events, logger };
}
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

describe("rate limiter", () => {
  it("R1 allows up to the limit, then blocks", async () => {
    const { limiter } = build();
    const ctx = makeCtx();
    for (let i = 0; i < 3; i++) expect(code(await limiter.check(ctx, rule))).toBe("OK");
    expect(code(await limiter.check(ctx, rule))).toBe("RATE_LIMITED");
  });
  it("reports remaining attempts", async () => {
    const { limiter } = build();
    const r = await limiter.check(makeCtx(), rule);
    expect(r.ok && r.value.remaining).toBe(2);
  });
  it("R2 the account limit holds when the address changes", async () => {
    const { limiter } = build();
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx({ ip: `203.0.113.${i + 1}` }), rule, { memberId: A });
    expect(code(await limiter.check(makeCtx({ ip: "198.51.100.7" }), rule, { memberId: A }))).toBe("RATE_LIMITED");
  });
  it("R3 the address limit holds when the account changes", async () => {
    const { limiter } = build();
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx(), rule, { memberId: i % 2 ? A : B });
    expect(code(await limiter.check(makeCtx(), rule, { memberId: "33333333-3333-4333-8333-333333333333" }))).toBe("RATE_LIMITED");
  });
  it("R4 a missing address shares one bucket and cannot dodge the limit", async () => {
    const { limiter } = build();
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx({ ip: null }), rule);
    expect(code(await limiter.check(makeCtx({ ip: null }), rule))).toBe("RATE_LIMITED");
  });
  it("R5 raw address and account id never appear in counter keys", async () => {
    const { limiter, repo } = build();
    await limiter.check(makeCtx({ ip: "203.0.113.9" }), rule, { memberId: A });
    const all = repo.keys.join("|");
    expect(all).not.toContain("203.0.113.9");
    expect(all).not.toContain(A);
    expect(all).toMatch(/^login:ip:[0-9a-f]{32}\|login:acct:[0-9a-f]{32}$/);
  });
  it("R6 writes one security event per scope per window, not one per blocked call", async () => {
    const { limiter, events } = build();
    for (let i = 0; i < 10; i++) await limiter.check(makeCtx(), rule);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ type: "rate_limited", severity: "low" });
    expect(JSON.stringify(events.events)).not.toContain("203.0.113.9");
  });
  it("R7 fails closed when the counter store is down", async () => {
    const { limiter, logger } = build({ repoFails: true });
    expect(code(await limiter.check(makeCtx(), rule))).toBe("SYSTEM_UNAVAILABLE");
    expect(logger.errors).toHaveLength(1);
  });
  it("R8 a failed security event write does not change the decision", async () => {
    const { limiter } = build({ eventsFail: true });
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx(), rule);
    expect(code(await limiter.check(makeCtx(), rule))).toBe("RATE_LIMITED");
  });
  it("R9 rejects invalid rules instead of allowing", async () => {
    const { limiter } = build();
    for (const bad of [{ name: "x", limit: 0, windowSeconds: 60 }, { name: "x", limit: 1.5, windowSeconds: 60 }, { name: "x", limit: 3, windowSeconds: 0 }, { name: "", limit: 3, windowSeconds: 60 }]) {
      expect(code(await limiter.check(makeCtx(), bad))).toBe("INTERNAL");
    }
  });
  it("R10 refuses a weak secret at construction", () => {
    expect(() => createRateLimiter({ limits: fakeRateRepo(), events: fakeSecurityEvents(), hmacSecret: "short", logger: fakeLogger() })).toThrow();
  });
  it("R11 different rules do not share counters", async () => {
    const { limiter } = build();
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx(), rule);
    expect(code(await limiter.check(makeCtx(), { ...rule, name: "register" }))).toBe("OK");
  });
  it("uses the request id as the error reference", async () => {
    const { limiter } = build();
    for (let i = 0; i < 3; i++) await limiter.check(makeCtx(), rule);
    const r = await limiter.check(makeCtx({ requestId: "req_rl" }), rule);
    expect(!r.ok && r.error.reference).toBe("req_rl");
  });
  it("R12 a tighter account limit applies without tightening the address limit", async () => {
    const { limiter } = build();
    const r2 = { name: "login2", limit: 50, windowSeconds: 60, accountLimit: 2 };
    expect(code(await limiter.check(makeCtx({ ip: "203.0.113.1" }), r2, { memberId: A }))).toBe("OK");
    expect(code(await limiter.check(makeCtx({ ip: "203.0.113.2" }), r2, { memberId: A }))).toBe("OK");
    expect(code(await limiter.check(makeCtx({ ip: "203.0.113.3" }), r2, { memberId: A }))).toBe("RATE_LIMITED");
    // many different accounts from one shared address are still fine under the loose address limit
    for (let i = 0; i < 10; i++) expect(code(await limiter.check(makeCtx({ ip: "198.51.100.5" }), r2, { memberId: `00000000-0000-4000-8000-0000000000${10 + i}` }))).toBe("OK");
  });
  it("R13 rejects an invalid account limit", async () => {
    const { limiter } = build();
    expect(code(await limiter.check(makeCtx(), { name: "x", limit: 5, windowSeconds: 60, accountLimit: 0 } as never))).toBe("INTERNAL");
  });
});
