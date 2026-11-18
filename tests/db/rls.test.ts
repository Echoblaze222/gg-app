/**
 * I8 and I10: a member reads only their own rows, and the browser role can never write money state.
 * Every statement runs as the real `anon`, `authenticated` or `service_role` database role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PERMISSION_DENIED,
  asRole,
  closePool,
  createMember,
  createObligation,
  createPayout,
  createPlan,
  expectDbError,
  fundMember,
  one,
  q,
  resetDatabase,
} from "./helpers";

let a: string;
let b: string;
let aAttempt: string;
let bAttempt: string;
let aPayout: string;

beforeAll(async () => {
  await resetDatabase();
  a = await createMember({ name: "Member A" });
  b = await createMember({ name: "Member B" });
  aAttempt = await fundMember(a, 100_000);
  bAttempt = await fundMember(b, 200_000);
  const planA = await createPlan(a);
  await createObligation(planA, a, "2031-01-01");
  await createObligation(await createPlan(b), b, "2031-01-01");
  aPayout = await createPayout(a, 10_000);
  await createPayout(b, 20_000);
  await q(
    `insert into payment_methods (member_id, provider_authorization_ref, provider_card_signature, brand, last4, authorization_email)
     values ($1, 'AUTH_secret_a', 'SIG_a', 'visa', '4081', 'a@example.ng'), ($2, 'AUTH_secret_b', 'SIG_b', 'mastercard', '5060', 'b@example.ng')`,
    [a, b],
  );
});
afterAll(closePool);

const asA = <T>(fn: Parameters<typeof asRole<T>>[2]) => asRole("authenticated", a, fn);

describe("anon sees and does nothing", () => {
  const TABLES = [
    "members", "member_roles", "contribution_plans", "contribution_obligations", "payment_attempts", "payment_methods",
    "payment_events", "ledger_entries", "ledger_accounts", "payout_requests", "refunds", "notifications", "announcements",
    "support_tickets", "support_messages", "policy_versions", "policy_acceptances", "privacy_requests", "app_settings",
    "audit_logs", "security_events", "roles", "permissions",
  ];
  it.each(TABLES)("cannot read %s", async (table) => {
    await expectDbError(asRole("anon", null, (c) => c.query(`select * from ${table} limit 1`)), PERMISSION_DENIED);
  });

  it("cannot run the money or identity functions", async () => {
    await expectDbError(asRole("anon", null, (c) => c.query("select * from my_balance()")), PERMISSION_DENIED);
    await expectDbError(asRole("anon", null, (c) => c.query("select bootstrap_owner(gen_random_uuid())")), PERMISSION_DENIED);
  });
});

describe("a member reads only their own rows", () => {
  const OWN: Array<[string, string]> = [
    ["members", "id"],
    ["member_roles", "member_id"],
    ["contribution_plans", "member_id"],
    ["contribution_obligations", "member_id"],
    ["payment_attempts", "member_id"],
    ["ledger_entries", "member_id"],
    ["payout_requests", "member_id"],
  ];

  it.each(OWN)("%s returns only the signed in member's rows", async (table, column) => {
    const rows = await asA((c) => c.query<{ owner: string }>(`select ${column}::text as owner from ${table}`));
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(new Set(rows.rows.map((r) => r.owner))).toEqual(new Set([a]));
  });

  it("cannot fetch another member's row by id", async () => {
    expect((await asA((c) => c.query("select 1 from members where id = $1", [b]))).rowCount).toBe(0);
    expect((await asA((c) => c.query("select 1 from payment_attempts where id = $1", [bAttempt]))).rowCount).toBe(0);
    expect((await asA((c) => c.query("select 1 from ledger_entries where member_id = $1", [b]))).rowCount).toBe(0);
  });

  it("a signed in session with no member id sees nothing", async () => {
    const rows = await asRole("authenticated", null, (c) => c.query("select 1 from members"));
    expect(rows.rowCount).toBe(0);
  });

  it("my_balance returns the caller's own balance and nobody else's", async () => {
    const mine = await asA((c) => c.query("select * from my_balance()"));
    expect(mine.rows).toEqual([{ ledger_kobo: "100000", held_kobo: "10000", available_kobo: "90000" }]);
    const theirs = await asRole("authenticated", b, (c) => c.query("select * from my_balance()"));
    expect(theirs.rows).toEqual([{ ledger_kobo: "200000", held_kobo: "20000", available_kobo: "180000" }]);
  });

  it("the provider authorization reference is never readable (D10)", async () => {
    const ok = await asA((c) => c.query("select id, brand, last4 from payment_methods"));
    expect(ok.rows).toHaveLength(1);
    expect(ok.rows[0]).toMatchObject({ brand: "visa", last4: "4081" });
    await expectDbError(asA((c) => c.query("select provider_authorization_ref from payment_methods")), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("select provider_card_signature from payment_methods")), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("select * from payment_methods")), PERMISSION_DENIED);
  });

  it.each(["ledger_accounts", "payment_events", "reconciliation_runs", "reconciliation_records", "security_events", "audit_logs", "rate_limits", "step_up_challenges", "app_settings"])(
    "has no access to server-only table %s",
    async (table) => {
      await expectDbError(asA((c) => c.query(`select * from ${table} limit 1`)), PERMISSION_DENIED);
    },
  );
});

describe("a member can never write money state (I10)", () => {
  it("cannot insert, update or delete ledger entries", async () => {
    await expectDbError(
      asA((c) => c.query("insert into ledger_entries (member_id, entry_type, direction, amount_kobo, reason) values ($1, 'adjustment_credit', 'credit', 99999999, 'free money')", [a])),
      PERMISSION_DENIED,
    );
    await expectDbError(asA((c) => c.query("update ledger_entries set amount_kobo = 99999999")), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("delete from ledger_entries")), PERMISSION_DENIED);
  });

  it("cannot create or change a payment attempt, so cannot mark their own payment successful", async () => {
    await expectDbError(
      asA((c) => c.query("insert into payment_attempts (member_id, purpose, amount_kobo, reference, idempotency_key) values ($1, 'one_time_contribution', 1000, 'ref_forged_000001', 'idem_forged_00000001')", [a])),
      PERMISSION_DENIED,
    );
    await expectDbError(asA((c) => c.query("update payment_attempts set status = 'successful' where id = $1", [aAttempt])), PERMISSION_DENIED);
  });

  it("cannot create, approve or edit a payout directly", async () => {
    await expectDbError(
      asA((c) => c.query("insert into payout_requests (member_id, amount_kobo, destination_bank_code, destination_bank_name, destination_account_number) values ($1, 1000, '058', 'Bank', '0123456789')", [a])),
      PERMISSION_DENIED,
    );
    await expectDbError(asA((c) => c.query("update payout_requests set status = 'approved' where id = $1", [aPayout])), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("update payout_requests set destination_account_number = '9999999999' where id = $1", [aPayout])), PERMISSION_DENIED);
  });

  it("cannot create refunds, plans, obligations or payment methods directly", async () => {
    for (const sql of [
      "insert into refunds (payment_attempt_id, member_id, amount_kobo, reason, requested_by) select id, member_id, 100, 'self refund', member_id from payment_attempts limit 1",
      "insert into contribution_plans (member_id, frequency, amount_kobo, starts_on) select id, 'daily', 100, current_date from members limit 1",
      "update contribution_obligations set status = 'cancelled'",
      "update payment_methods set reusable = true",
    ]) {
      await expectDbError(asA((c) => c.query(sql)), PERMISSION_DENIED);
    }
  });

  it("cannot call the money functions", async () => {
    for (const sql of [
      "select * from ledger_post(p_member => (select auth.uid()), p_type => 'adjustment_credit', p_amount => 1000::bigint, p_reason => 'free money')",
      "select payout_create((select auth.uid()), 1000::bigint, '058', 'Bank', '0123456789')",
      "select bootstrap_owner((select auth.uid()))",
      "select member_balance((select auth.uid()))",
      "select has_permission((select auth.uid()), 'admin.roles.manage')",
    ]) {
      await expectDbError(asA((c) => c.query(sql)), PERMISSION_DENIED);
    }
  });
});

describe("a member cannot change who they are", () => {
  it("can edit their own name and phone", async () => {
    const res = await asRole("authenticated", a, (c) => c.query("update members set full_name = 'Member A Renamed', phone = '+2348000000001' where id = $1", [a]), { commit: false });
    expect(res.rowCount).toBe(1);
  });

  it("cannot edit another member's profile (the row is invisible, so nothing changes)", async () => {
    const res = await asA((c) => c.query("update members set full_name = 'Hacked Name' where id = $1", [b]));
    expect(res.rowCount).toBe(0);
    expect((await one<{ full_name: string }>("select full_name from members where id = $1", [b])).full_name).toBe("Member B");
  });

  it("cannot touch status, email or id", async () => {
    await expectDbError(asA((c) => c.query("update members set status = 'active' where id = $1", [a])), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("update members set email = 'new@example.ng' where id = $1", [a])), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("update members set id = gen_random_uuid() where id = $1", [a])), PERMISSION_DENIED);
  });

  it("cannot grant themselves a role or a permission", async () => {
    await expectDbError(asA((c) => c.query("insert into member_roles (member_id, role) values ($1, 'owner')", [a])), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("insert into role_permissions (role, permission) values ('member', 'admin.roles.manage')")), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("update member_roles set role = 'owner' where member_id = $1", [a])), PERMISSION_DENIED);
  });
});

describe("notifications, support and legal rows are private to the member", () => {
  let aNote: string;
  let bNote: string;
  let aTicket: string;
  let bTicket: string;

  beforeAll(async () => {
    aNote = (await one<{ id: string }>("insert into notifications (member_id, type, title, body) values ($1, 'announcement', 'For A', 'private') returning id", [a])).id;
    bNote = (await one<{ id: string }>("insert into notifications (member_id, type, title, body) values ($1, 'announcement', 'For B', 'private') returning id", [b])).id;
    aTicket = (await one<{ id: string }>("insert into support_tickets (member_id, subject) values ($1, 'Ticket from A') returning id", [a])).id;
    bTicket = (await one<{ id: string }>("insert into support_tickets (member_id, subject) values ($1, 'Ticket from B') returning id", [b])).id;
    await q("insert into support_messages (ticket_id, author_id, body) values ($1, $2, 'hello from b')", [bTicket, b]);
  });

  it("notifications: own only, and only read_at can change", async () => {
    const rows = await asA((c) => c.query<{ id: string }>("select id from notifications"));
    expect(rows.rows.map((r) => r.id)).toEqual([aNote]);
    expect((await asA((c) => c.query("update notifications set read_at = now() where id = $1", [aNote]))).rowCount).toBe(1);
    expect((await asA((c) => c.query("update notifications set read_at = now() where id = $1", [bNote]))).rowCount).toBe(0);
    await expectDbError(asA((c) => c.query("update notifications set title = 'changed' where id = $1", [aNote])), PERMISSION_DENIED);
    await expectDbError(asA((c) => c.query("delete from notifications")), PERMISSION_DENIED);
  });

  it("support tickets: own only, cannot read or write into another member's ticket", async () => {
    const rows = await asA((c) => c.query<{ id: string }>("select id from support_tickets"));
    expect(rows.rows.map((r) => r.id)).toEqual([aTicket]);
    expect((await asA((c) => c.query("select 1 from support_messages where ticket_id = $1", [bTicket]))).rowCount).toBe(0);
    await expectDbError(
      asA((c) => c.query("insert into support_messages (ticket_id, author_id, body) values ($1, $2, 'sneaking in')", [bTicket, a])),
      { code: "42501" },
    );
  });

  it("a member can open a ticket and write in it, but cannot pose as staff or as another member", async () => {
    await asRole(
      "authenticated",
      a,
      async (c) => {
        const t = await c.query<{ id: string }>("insert into support_tickets (member_id, subject) values ($1, 'My new ticket') returning id", [a]);
        await c.query("insert into support_messages (ticket_id, author_id, body) values ($1, $2, 'I need help')", [t.rows[0].id, a]);
        await c.query("savepoint s1");
        await expect(c.query("insert into support_messages (ticket_id, author_id, from_staff, body) values ($1, $2, true, 'staff reply')", [t.rows[0].id, a])).rejects.toMatchObject({ code: "42501" });
        await c.query("rollback to savepoint s1");
      },
      { commit: false },
    );
    await expectDbError(
      asA((c) => c.query("insert into support_tickets (member_id, subject) values ($1, 'On behalf of B')", [b])),
      { code: "42501" },
    );
  });

  it("members cannot close or edit a ticket's status", async () => {
    await expectDbError(asA((c) => c.query("update support_tickets set status = 'closed' where id = $1", [aTicket])), PERMISSION_DENIED);
  });

  it("announcements: only published ones are visible", async () => {
    const owner = await createMember();
    await q("insert into announcements (title, body, published_at, created_by) values ('Live', 'visible', now() - interval '1 hour', $1)", [owner]);
    await q("insert into announcements (title, body, published_at, created_by) values ('Draft', 'hidden', null, $1)", [owner]);
    await q("insert into announcements (title, body, published_at, created_by) values ('Scheduled', 'hidden', now() + interval '1 day', $1)", [owner]);
    const rows = await asA((c) => c.query<{ title: string }>("select title from announcements"));
    expect(rows.rows.map((r) => r.title)).toEqual(["Live"]);
    await expectDbError(asA((c) => c.query("insert into announcements (title, body, created_by) values ('x', 'y', $1)", [a])), PERMISSION_DENIED);
  });

  it("policies: only published versions are visible, and a member records only their own acceptance", async () => {
    const published = (await one<{ id: string }>("insert into policy_versions (kind, version, body, published_at) values ('terms', 'v1', 'terms text', now()) returning id")).id;
    await q("insert into policy_versions (kind, version, body) values ('terms', 'v2-draft', 'draft text')");
    const rows = await asA((c) => c.query<{ version: string }>("select version from policy_versions"));
    expect(rows.rows.map((r) => r.version)).toEqual(["v1"]);
    await asRole("authenticated", a, (c) => c.query("insert into policy_acceptances (member_id, policy_version_id) values ($1, $2)", [a, published]));
    await expectDbError(
      asA((c) => c.query("insert into policy_acceptances (member_id, policy_version_id) values ($1, $2)", [b, published])),
      { code: "42501" },
    );
    await expectDbError(asA((c) => c.query("update policy_versions set body = 'rewritten'")), PERMISSION_DENIED);
  });

  it("privacy requests: own only", async () => {
    await asRole("authenticated", a, (c) => c.query("insert into privacy_requests (member_id, kind) values ($1, 'export')", [a]), { commit: true });
    const mine = await asA((c) => c.query("select member_id from privacy_requests"));
    expect(mine.rows).toEqual([{ member_id: a }]);
    const theirs = await asRole("authenticated", b, (c) => c.query("select 1 from privacy_requests"));
    expect(theirs.rowCount).toBe(0);
    await expectDbError(asA((c) => c.query("insert into privacy_requests (member_id, kind) values ($1, 'deletion')", [b])), { code: "42501" });
  });
});

describe("the server role (service_role) is powerful but still cannot rewrite history", () => {
  it("can create a payment attempt", async () => {
    const m = await createMember();
    const ref = `ref_srv_${m.slice(0, 8)}`;
    await asRole(
      "service_role",
      null,
      (c) => c.query("insert into payment_attempts (member_id, purpose, amount_kobo, reference, idempotency_key) values ($1, 'one_time_contribution', 1000, $2, $3)", [m, ref, `idem_srv_${m.replace(/-/g, "").slice(0, 20)}`]),
      { commit: true },
    );
    expect((await q("select 1 from payment_attempts where reference = $1", [ref])).length).toBe(1);
  });

  it.each(["members", "payment_attempts", "payout_requests", "refunds", "payment_events"])("cannot delete from %s", async (table) => {
    await expectDbError(asRole("service_role", null, (c) => c.query(`delete from ${table}`)), PERMISSION_DENIED);
  });

  it.each(["audit_logs", "security_events"])("cannot update or delete %s", async (table) => {
    await expectDbError(asRole("service_role", null, (c) => c.query(`update ${table} set created_at = now()`)), PERMISSION_DENIED);
    await expectDbError(asRole("service_role", null, (c) => c.query(`delete from ${table}`)), PERMISSION_DENIED);
  });

  it("can run the money functions", async () => {
    const m = await createMember();
    await fundMember(m, 5_000);
    const r = await asRole("service_role", null, (c) => c.query("select * from member_balance($1)", [m]));
    expect(r.rows).toEqual([{ ledger_kobo: "5000", held_kobo: "0", available_kobo: "5000" }]);
  });
});
