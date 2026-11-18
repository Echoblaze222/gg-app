import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECK_VIOLATION, closePool, createMember, expectDbError, q, resetDatabase } from "./helpers";

beforeAll(resetDatabase);
afterAll(closePool);

const APPEND_ONLY = { code: "GG001", message: "append only table" };

describe("audit_logs and security_events are append only", () => {
  let member: string;
  beforeAll(async () => {
    member = await createMember();
    await q("insert into audit_logs (actor_id, action, target_type, target_id, result) values ($1, 'payout.approve', 'payout', 'p1', 'success')", [member]);
    await q("insert into security_events (type, severity, member_id) values ('login_failed', 'low', $1)", [member]);
  });

  it.each(["audit_logs", "security_events"])("%s accepts inserts", async (table) => {
    const rows = await q<{ n: string }>(`select count(*)::text as n from ${table}`);
    expect(Number(rows[0].n)).toBeGreaterThan(0);
  });

  it.each([
    ["audit_logs", "action = 'tampered'"],
    ["security_events", "severity = 'info'"],
  ])("%s cannot be updated", async (table, set) => {
    await expectDbError(q(`update ${table} set ${set}`), APPEND_ONLY);
  });

  it.each(["audit_logs", "security_events"])("%s cannot be deleted from or truncated", async (table) => {
    await expectDbError(q(`delete from ${table}`), APPEND_ONLY);
    await expectDbError(q(`truncate ${table}`), APPEND_ONLY);
  });

  it("audit_logs.action is bounded and result must be a known value", async () => {
    await expectDbError(q("insert into audit_logs (action, result) values ('', 'success')"), CHECK_VIOLATION);
    await expectDbError(q("insert into audit_logs (action, result) values ($1, 'success')", ["x".repeat(121)]), CHECK_VIOLATION);
    await expectDbError(q("insert into audit_logs (action, result) values ('x', 'maybe')"), { code: "22P02" });
  });
});

describe("step up challenges store only a hash (I9)", () => {
  it("a stored code must look like a hash, not a short code", async () => {
    const m = await createMember();
    await expectDbError(
      q("insert into step_up_challenges (member_id, purpose, code_hash, expires_at) values ($1, 'payout', '123456', now() + interval '10 minutes')", [m]),
      CHECK_VIOLATION,
    );
    await q(
      "insert into step_up_challenges (member_id, purpose, code_hash, expires_at) values ($1, 'payout', $2, now() + interval '10 minutes')",
      [m, "a".repeat(64)],
    );
  });

  it("a challenge must expire after it is created", async () => {
    const m = await createMember();
    await expectDbError(
      q("insert into step_up_challenges (member_id, purpose, code_hash, expires_at) values ($1, 'payout', $2, now() - interval '1 minute')", [m, "b".repeat(64)]),
      CHECK_VIOLATION,
    );
  });
});
