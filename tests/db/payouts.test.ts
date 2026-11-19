import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  balanceOf,
  closePool,
  createMember,
  createPayout,
  expectDbError,
  fundMember,
  gg,
  ledgerCount,
  one,
  q,
  raceWhileFirstIsOpen,
  resetDatabase,
} from "./helpers";

beforeAll(resetDatabase);
afterAll(closePool);

const setStatus = (id: string, status: string, extra = "") =>
  q(`update payout_requests set status = $2::payout_status ${extra} where id = $1`, [id, status]);

/** requested -> verified -> approved -> processing */
async function advanceToProcessing(id: string) {
  await setStatus(id, "verified");
  await setStatus(id, "approved");
  await setStatus(id, "processing");
}

describe("I6: at most one open payout per member", () => {
  it("a second request while one is open is refused", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await createPayout(m, 10_000);
    await expectDbError(createPayout(m, 10_000), gg("PAYOUT_ALREADY_OPEN"));
  });

  it("stays refused while the first is verified, approved or processing", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    for (const status of ["verified", "approved", "processing"]) {
      await setStatus(id, status);
      await expectDbError(createPayout(m, 10_000), gg("PAYOUT_ALREADY_OPEN"));
    }
  });

  it("a rejected or cancelled request frees the slot", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const first = await createPayout(m, 10_000);
    await setStatus(first, "rejected", ", decision_note = 'Details do not match'");
    const second = await createPayout(m, 10_000);
    await setStatus(second, "cancelled");
    await createPayout(m, 10_000);
  });

  it("the database index also refuses a direct second open row", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await createPayout(m, 10_000);
    await expectDbError(
      q(
        `insert into payout_requests (member_id, amount_kobo, destination_bank_code, destination_bank_name, destination_account_number)
         values ($1, 5000, '058', 'Test Bank', '0123456789')`,
        [m],
      ),
      { code: "23505" },
    );
  });

  it("two simultaneous requests: the second waits for the first, then is refused", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const race = await raceWhileFirstIsOpen("select payout_create($1::uuid, 60000::bigint, '058', 'Test Bank', '0123456789')", [m]);
    expect(race.secondWasBlocked).toBe(true);
    expect(race.second).toEqual({ message: "PAYOUT_ALREADY_OPEN" });
    expect((await balanceOf(m)).held).toBe(60_000);
    expect((await q("select 1 from payout_requests where member_id = $1", [m])).length).toBe(1);
  });
});

describe("I7: available balance = ledger balance - open payouts", () => {
  it("an open payout holds its amount", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await createPayout(m, 60_000);
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 60_000, available: 40_000 });
  });

  it("cannot request more than the available balance, but can request exactly all of it", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await expectDbError(createPayout(m, 100_001), gg("PAYOUT_INSUFFICIENT_BALANCE"));
    await createPayout(m, 100_000);
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 100_000, available: 0 });
  });

  it("a member with no money cannot request anything", async () => {
    const m = await createMember();
    await expectDbError(createPayout(m, 1), gg("PAYOUT_INSUFFICIENT_BALANCE"));
  });

  it("rejecting a request releases the hold", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 60_000);
    await setStatus(id, "rejected", ", decision_note = 'Not approved'");
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 0, available: 100_000 });
  });

  it("only active members may withdraw", async () => {
    for (const status of ["pending_verification", "suspended", "closed"] as const) {
      const m = await createMember({ status });
      await expectDbError(createPayout(m, 1_000), gg("PAYOUT_NOT_ELIGIBLE"));
    }
  });

  it("zero and negative amounts are refused", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    await expectDbError(createPayout(m, 0), gg("PAYMENT_AMOUNT_INVALID"));
    await expectDbError(createPayout(m, -5), gg("PAYMENT_AMOUNT_INVALID"));
  });

  it("an unknown member is refused", async () => {
    await expectDbError(createPayout("00000000-0000-4000-8000-000000000002", 1_000), gg("NOT_FOUND"));
  });

  it("destination details are validated", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const create = (bank: string, account: string) =>
      q("select payout_create($1::uuid, 1000::bigint, $2, 'Test Bank', $3)", [m, bank, account]);
    await expectDbError(create("058", "123"), CHECK_VIOLATION);
    await expectDbError(create("058", "01234567890"), CHECK_VIOLATION);
    await expectDbError(create("058", "01234abcde"), CHECK_VIOLATION);
    await expectDbError(create("ab", "0123456789"), CHECK_VIOLATION);
  });
});

describe("payout lifecycle and the ledger debit", () => {
  it("paying a payout posts exactly one debit and releases the hold", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 60_000);
    await advanceToProcessing(id);
    await setStatus(id, "paid", ", provider_transfer_ref = 'trf_0001'");
    expect(await ledgerCount(m, "payout_debit")).toBe(1);
    expect(await balanceOf(m)).toEqual({ ledger: 40_000, held: 0, available: 40_000 });
    const row = await one<{ verified_at: Date; decided_at: Date; resolved_at: Date }>(
      "select verified_at, decided_at, resolved_at from payout_requests where id = $1",
      [id],
    );
    expect(row.verified_at).not.toBeNull();
    expect(row.decided_at).not.toBeNull();
    expect(row.resolved_at).not.toBeNull();
  });

  it("posting the debit again is a no-op", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 60_000);
    await advanceToProcessing(id);
    await setStatus(id, "paid", ", provider_transfer_ref = 'trf_0002'");
    const again = await q<{ created: boolean }>("select * from ledger_post($1::uuid, 'payout_debit', 60000::bigint, null, $2::uuid)", [m, id]);
    expect(again[0].created).toBe(false);
    expect(await ledgerCount(m, "payout_debit")).toBe(1);
  });

  it("a failed transfer releases the hold and posts no debit", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 60_000);
    await advanceToProcessing(id);
    await setStatus(id, "failed");
    expect(await ledgerCount(m, "payout_debit")).toBe(0);
    expect(await balanceOf(m)).toEqual({ ledger: 100_000, held: 0, available: 100_000 });
  });

  it("paid requires a provider transfer reference, rejected requires a note", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    await advanceToProcessing(id);
    await expectDbError(setStatus(id, "paid"), CHECK_VIOLATION);
    const other = await createMember();
    await fundMember(other, 100_000);
    const id2 = await createPayout(other, 10_000);
    await expectDbError(setStatus(id2, "rejected"), CHECK_VIOLATION);
  });

  it("one provider transfer reference cannot pay two payouts", async () => {
    const a = await createMember();
    const b = await createMember();
    await fundMember(a, 100_000);
    await fundMember(b, 100_000);
    const pa = await createPayout(a, 10_000);
    const pb = await createPayout(b, 10_000);
    await advanceToProcessing(pa);
    await advanceToProcessing(pb);
    await setStatus(pa, "paid", ", provider_transfer_ref = 'trf_shared'");
    await expectDbError(setStatus(pb, "paid", ", provider_transfer_ref = 'trf_shared'"), { code: "23505" });
  });

  it.each([
    ["requested", "approved"],
    ["requested", "processing"],
    ["requested", "paid"],
    ["verified", "paid"],
    ["approved", "paid"],
  ])("rejects %s -> %s", async (from, to) => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    if (from !== "requested") await setStatus(id, "verified");
    if (from === "approved") await setStatus(id, "approved");
    await expectDbError(setStatus(id, to, to === "paid" ? ", provider_transfer_ref = 'trf_bad'" : ""), gg("PAYOUT_TRANSITION_INVALID"));
  });

  it.each(["paid", "rejected", "failed", "cancelled"])("%s is final", async (final) => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    if (final === "paid") {
      await advanceToProcessing(id);
      await setStatus(id, "paid", ", provider_transfer_ref = 'trf_final'");
    } else if (final === "failed") {
      await advanceToProcessing(id);
      await setStatus(id, "failed");
    } else if (final === "rejected") {
      await setStatus(id, "rejected", ", decision_note = 'Rejected for test'");
    } else {
      await setStatus(id, "cancelled");
    }
    // Setting the same status again is not a transition, so the state itself is left out.
    for (const next of ["requested", "verified", "approved", "processing", "cancelled"].filter((s) => s !== final)) {
      await expectDbError(setStatus(id, next), gg("PAYOUT_TRANSITION_INVALID"));
    }
  });
});

describe("ADR-007: the destination is copied onto the request and cannot be redirected", () => {
  it.each([
    ["destination_account_number", "'9999999999'"],
    ["destination_bank_code", "'044'"],
    ["destination_bank_name", "'Another Bank'"],
    ["destination_account_name", "'Someone Else'"],
    ["amount_kobo", "amount_kobo + 1"],
    ["member_id", "(select id from members where id <> payout_requests.member_id limit 1)"],
  ])("%s is frozen once requested", async (column, expr) => {
    const m = await createMember();
    await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    await expectDbError(q(`update payout_requests set ${column} = ${expr} where id = $1`, [id]), gg("CONFLICT"));
  });

  it("the snapshot keeps what the member entered", async () => {
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 10_000);
    const row = await one<{ destination_bank_code: string; destination_account_number: string }>(
      "select destination_bank_code, destination_account_number from payout_requests where id = $1",
      [id],
    );
    expect(row).toEqual({ destination_bank_code: "058", destination_account_number: "0123456789" });
  });
});

describe("payout debit safety", () => {
  it("a payout cannot be paid if the ledger no longer covers it", async () => {
    // Simulates a bug elsewhere: the money was taken out by an adjustment while the payout was in flight.
    const m = await createMember();
    await fundMember(m, 100_000);
    const id = await createPayout(m, 100_000);
    await advanceToProcessing(id);
    await q("insert into ledger_entries (member_id, entry_type, direction, amount_kobo, reason) values ($1, 'adjustment_debit', 'debit', 1, 'out of band')", [m]);
    await expectDbError(setStatus(id, "paid", ", provider_transfer_ref = 'trf_short'"), gg("LEDGER_NEGATIVE_BALANCE"));
    expect((await one<{ status: string }>("select status from payout_requests where id = $1", [id])).status).toBe("processing");
    expect(await ledgerCount(m, "payout_debit")).toBe(0);
  });
});
