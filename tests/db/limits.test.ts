/**
 * ADR-014: no member may hold more than member.balance.max_kobo (500,000 naira by default).
 * The database refuses the contribution attempt, so no client or service bug can exceed the cap.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PERMISSION_DENIED,
  asRole,
  closePool,
  createAttempt,
  createMember,
  expectDbError,
  fundMember,
  gg,
  one,
  q,
  raceWhileFirstIsOpen,
  resetDatabase,
  setAttemptStatus,
} from "./helpers";

const CAP = 50_000_000; // 500,000 naira in kobo
const REFUSED = gg("PAYMENT_AMOUNT_INVALID");

beforeAll(resetDatabase);
afterAll(closePool);

const setCap = (value: string) => q("update app_settings set value = $1 where key = 'member.balance.max_kobo'", [value]);
const restoreCap = () => setCap(String(CAP));

describe("the default cap", () => {
  it("is 500,000 naira, and one contribution cannot be larger than the cap", async () => {
    const rows = await q<{ key: string; value: string }>(
      "select key, value from app_settings where key in ('member.balance.max_kobo', 'contribution.max_kobo')",
    );
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({
      "member.balance.max_kobo": String(CAP),
      "contribution.max_kobo": String(CAP),
    });
  });
});

describe("a contribution that would pass the cap is refused", () => {
  it("allows exactly the cap and refuses one kobo more", async () => {
    const ok = await createMember();
    await createAttempt(ok, CAP);
    const over = await createMember();
    await expectDbError(createAttempt(over, CAP + 1), REFUSED);
  });

  it("counts money already in the ledger", async () => {
    const m = await createMember();
    await fundMember(m, 30_000_000);
    await expectDbError(createAttempt(m, 20_000_001), REFUSED);
    await createAttempt(m, 20_000_000);
  });

  it("counts contributions still in flight, so two pending payments cannot both fit", async () => {
    const m = await createMember();
    await createAttempt(m, 30_000_000);
    await expectDbError(createAttempt(m, 20_000_001), REFUSED);
    await createAttempt(m, 20_000_000);
  });

  it("a failed or cancelled attempt gives its room back", async () => {
    const m = await createMember();
    const first = await createAttempt(m, 40_000_000);
    await expectDbError(createAttempt(m, 20_000_000), REFUSED);
    await setAttemptStatus(first, "failed");
    await createAttempt(m, 20_000_000);
  });

  it("withdrawing frees room to save again", async () => {
    const m = await createMember();
    await fundMember(m, 40_000_000);
    await expectDbError(createAttempt(m, 20_000_000), REFUSED);
    await q("select * from ledger_post(p_member => $1::uuid, p_type => 'adjustment_debit', p_amount => 30000000::bigint, p_reason => 'room test')", [m]);
    await createAttempt(m, 20_000_000);
  });

  it("applies to scheduled contributions too", async () => {
    const m = await createMember();
    await fundMember(m, 49_000_000);
    await expectDbError(createAttempt(m, 1_000_001, { purpose: "scheduled_contribution" }), REFUSED);
  });

  it("each member has their own cap", async () => {
    const a = await createMember();
    const b = await createMember();
    await fundMember(a, CAP);
    await createAttempt(b, CAP);
  });

  it("a card authorization is not savings and is not counted", async () => {
    const m = await createMember();
    await fundMember(m, CAP);
    await createAttempt(m, 5_000, { purpose: "card_authorization" });
  });

  it("the refusal says why, in the error detail", async () => {
    const m = await createMember();
    let detail: string | undefined;
    try {
      await createAttempt(m, CAP + 1);
    } catch (err) {
      detail = (err as { detail?: string }).detail;
    }
    expect(detail).toBe("member_balance_limit");
  });
});

describe("two simultaneous contributions cannot both slip under the cap", () => {
  it("the second waits for the first, then is refused", async () => {
    const m = await createMember();
    await fundMember(m, 30_000_000);
    const race = await raceWhileFirstIsOpen(
      `insert into payment_attempts (member_id, purpose, amount_kobo, reference, idempotency_key)
       values ($1::uuid, 'one_time_contribution', 20000000, 'ref_' || gen_random_uuid()::text, replace(gen_random_uuid()::text, '-', ''))`,
      [m],
    );
    expect(race.secondWasBlocked, "the second attempt must wait on the member's ledger lock").toBe(true);
    expect(race.second).toEqual({ message: "PAYMENT_AMOUNT_INVALID" });
    expect((await q("select 1 from payment_attempts where member_id = $1 and status = 'initiating'", [m])).length).toBe(1);
  });
});

describe("the cap is configuration", () => {
  it("raising it lets members save more, and lowering it applies to the next attempt", async () => {
    try {
      const m = await createMember();
      await expectDbError(createAttempt(m, 60_000_000), REFUSED);
      await setCap("100000000");
      await createAttempt(m, 60_000_000);
      await setCap("1000");
      await expectDbError(createAttempt(await createMember(), 1_001), REFUSED);
    } finally {
      await restoreCap();
    }
  });

  it("a missing or unreadable cap blocks contributions instead of lifting the limit", async () => {
    try {
      await setCap("not a number");
      await expectDbError(createAttempt(await createMember(), 1_000), REFUSED);
      await q("delete from app_settings where key = 'member.balance.max_kobo'");
      await expectDbError(createAttempt(await createMember(), 1_000), REFUSED);
    } finally {
      await q(
        "insert into app_settings (key, value) values ('member.balance.max_kobo', $1) on conflict (key) do update set value = excluded.value",
        [String(CAP)],
      );
    }
  });

  it("a member cannot change it", async () => {
    const m = await createMember();
    await expectDbError(asRole("authenticated", m, (c) => c.query("update app_settings set value = '1' where key = 'member.balance.max_kobo'")), PERMISSION_DENIED);
  });
});

describe("the permission to change limits (admin.limits.update)", () => {
  const holds = async (member: string) =>
    (await one<{ ok: boolean }>("select has_permission($1, 'admin.limits.update') as ok", [member])).ok;

  it("the owner holds it by default", async () => {
    const owner = await createMember();
    await q("select bootstrap_owner($1)", [owner]);
    expect(await holds(owner)).toBe(true);
  });

  it("admin, support and members do not", async () => {
    for (const role of ["admin", "support"] as const) {
      const m = await createMember();
      await q("insert into member_roles (member_id, role) values ($1, $2::role_name)", [m, role]);
      expect(await holds(m), role).toBe(false);
    }
    expect(await holds(await createMember())).toBe(false);
  });
});
