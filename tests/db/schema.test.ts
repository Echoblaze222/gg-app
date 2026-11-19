import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUDIT_RESULTS,
  CONTRIBUTION_FREQUENCIES,
  CURRENCIES,
  LEDGER_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  MEMBER_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  OBLIGATION_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_CHANNELS,
  PAYMENT_PURPOSES,
  PAYOUT_STATUSES,
  PLAN_STATUSES,
  POLICY_KINDS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_STATUSES,
  RECONCILIATION_STATUSES,
  REFUND_STATUSES,
  ROLES,
  SECURITY_EVENT_TYPES,
  SEVERITIES,
  SUPPORT_TICKET_STATUSES,
} from "@/contracts/enums";
import {
  OBLIGATION_TRANSITIONS,
  PAYMENT_ATTEMPT_TRANSITIONS,
  PAYOUT_TRANSITIONS,
  REFUND_TRANSITIONS,
  canTransition,
} from "@/contracts/state-machines";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/contracts/permissions";
import { closePool, q, resetDatabase } from "./helpers";

beforeAll(resetDatabase);
afterAll(closePool);

describe("enums match the contract (contracts/enums.ts)", () => {
  const ENUMS: Record<string, readonly string[]> = {
    currency_code: CURRENCIES,
    role_name: ROLES,
    member_status: MEMBER_STATUSES,
    contribution_frequency: CONTRIBUTION_FREQUENCIES,
    plan_status: PLAN_STATUSES,
    obligation_status: OBLIGATION_STATUSES,
    payment_purpose: PAYMENT_PURPOSES,
    payment_channel: PAYMENT_CHANNELS,
    payment_attempt_status: PAYMENT_ATTEMPT_STATUSES,
    ledger_entry_type: LEDGER_ENTRY_TYPES,
    ledger_direction: LEDGER_DIRECTIONS,
    payout_status: PAYOUT_STATUSES,
    refund_status: REFUND_STATUSES,
    reconciliation_status: RECONCILIATION_STATUSES,
    notification_type: NOTIFICATION_TYPES,
    notification_channel: NOTIFICATION_CHANNELS,
    support_ticket_status: SUPPORT_TICKET_STATUSES,
    severity_level: SEVERITIES,
    security_event_type: SECURITY_EVENT_TYPES,
    audit_result: AUDIT_RESULTS,
    policy_kind: POLICY_KINDS,
    privacy_request_kind: PRIVACY_REQUEST_KINDS,
    privacy_request_status: PRIVACY_REQUEST_STATUSES,
  };

  it.each(Object.entries(ENUMS))("%s has exactly the contract values", async (typeName, expected) => {
    const rows = await q<{ enumlabel: string }>(
      "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1",
      [typeName],
    );
    expect(rows.map((r) => r.enumlabel).sort()).toEqual([...expected].sort());
  });

  it("every database enum is covered by this test, so a new one cannot drift unnoticed", async () => {
    const rows = await q<{ typname: string }>(
      "select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'",
    );
    expect(rows.map((r) => r.typname).sort()).toEqual(Object.keys(ENUMS).sort());
  });
});

describe("state machine functions match contracts/state-machines.ts for every pair", () => {
  const machines = [
    ["payment_attempt_transition_ok", "payment_attempt_status", PAYMENT_ATTEMPT_STATUSES, PAYMENT_ATTEMPT_TRANSITIONS],
    ["payout_transition_ok", "payout_status", PAYOUT_STATUSES, PAYOUT_TRANSITIONS],
    ["obligation_transition_ok", "obligation_status", OBLIGATION_STATUSES, OBLIGATION_TRANSITIONS],
    ["refund_transition_ok", "refund_status", REFUND_STATUSES, REFUND_TRANSITIONS],
  ] as const;

  for (const [fn, type, statuses, table] of machines) {
    it(`${fn}`, async () => {
      const mismatches: string[] = [];
      for (const from of statuses) {
        for (const to of statuses) {
          const r = await q<{ ok: boolean }>(`select ${fn}($1::${type}, $2::${type}) as ok`, [from, to]);
          const expected = canTransition(table as Record<string, readonly string[]>, from, to);
          if (r[0].ok !== expected) mismatches.push(`${from} -> ${to}: database ${r[0].ok}, contract ${expected}`);
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});

describe("seeded roles and permissions match contracts/permissions.ts", () => {
  it("roles", async () => {
    const rows = await q<{ name: string }>("select name from roles");
    expect(rows.map((r) => r.name).sort()).toEqual([...ROLES].sort());
  });

  it("permissions", async () => {
    const rows = await q<{ name: string }>("select name from permissions");
    expect(rows.map((r) => r.name).sort()).toEqual([...PERMISSIONS].sort());
  });

  it.each(ROLES)("role %s holds the contract default permissions", async (role) => {
    const rows = await q<{ permission: string }>("select permission from role_permissions where role = $1::role_name", [role]);
    expect(rows.map((r) => r.permission).sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS[role]].sort());
  });

  it("the default settings the owner can change exist", async () => {
    const rows = await q<{ key: string }>("select key from app_settings");
    expect(rows.map((r) => r.key).sort()).toEqual(
      [
        "contribution.max_kobo",
        "contribution.min_kobo",
        "member.balance.max_kobo",
        "payout.min_kobo",
        "payout.otp_max_attempts",
        "payout.otp_ttl_seconds",
      ].sort(),
    );
  });
});

describe("money is integer kobo (ADR-003)", () => {
  it("no floating point, numeric or money column exists anywhere", async () => {
    const rows = await q<{ col: string }>(
      `select table_name || '.' || column_name as col from information_schema.columns
       where table_schema = 'public' and data_type in ('real', 'double precision', 'numeric', 'money')`,
    );
    expect(rows).toEqual([]);
  });

  it("every *_kobo column is bigint", async () => {
    const rows = await q<{ col: string; data_type: string }>(
      `select table_name || '.' || column_name as col, data_type from information_schema.columns
       where table_schema = 'public' and column_name like '%\\_kobo' escape '\\'`,
    );
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.filter((r) => r.data_type !== "bigint")).toEqual([]);
  });
});

describe("nothing sensitive is stored (I9, ADR-013)", () => {
  const FORBIDDEN_TOKENS = new Set(["pan", "cvv", "cvc", "pin", "otp", "password", "bvn", "nin", "kyc", "secret"]);
  const FORBIDDEN_PHRASES = ["card_number", "national_id", "id_number", "account_pin"];

  it("no column can hold a card number, CVV, PIN, OTP, password, BVN or NIN", async () => {
    const rows = await q<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    const offenders = rows
      .filter(({ column_name }) => {
        const tokens = column_name.split("_");
        return tokens.some((t) => FORBIDDEN_TOKENS.has(t)) || FORBIDDEN_PHRASES.some((p) => column_name.includes(p));
      })
      .map((r) => `${r.table_name}.${r.column_name}`);
    expect(offenders).toEqual([]);
  });

  it("the payment method last4 column cannot hold more than four digits", async () => {
    const rows = await q<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.payment_methods'::regclass and contype = 'c'",
    );
    expect(rows.some((r) => r.def.includes("last4") && r.def.includes("\\d{4}"))).toBe(true);
  });
});

describe("deny by default (I8)", () => {
  it("row level security is enabled on every table", async () => {
    const rows = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("anon has no privilege on any table or sequence", async () => {
    const tables = await q<{ n: string }>(
      "select count(*)::text as n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'",
    );
    expect(Number(tables[0].n)).toBe(0);
    const cols = await q<{ n: string }>(
      "select count(*)::text as n from information_schema.column_privileges where table_schema = 'public' and grantee = 'anon'",
    );
    expect(Number(cols[0].n)).toBe(0);
  });

  it("the browser role (authenticated) holds no table-level write privilege anywhere", async () => {
    const rows = await q<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'`,
    );
    expect(rows).toEqual([]);
  });

  it("the only columns the browser role may write are the documented self service ones (I10)", async () => {
    const rows = await q<{ table_name: string; privilege_type: string; columns: string[] }>(
      `select table_name, privilege_type, array_agg(column_name::text order by column_name) as columns
       from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
       group by table_name, privilege_type order by table_name, privilege_type`,
    );
    expect(rows).toEqual([
      { table_name: "members", privilege_type: "UPDATE", columns: ["full_name", "phone"] },
      { table_name: "notifications", privilege_type: "UPDATE", columns: ["read_at"] },
      { table_name: "policy_acceptances", privilege_type: "INSERT", columns: ["ip", "member_id", "policy_version_id"] },
      { table_name: "privacy_requests", privilege_type: "INSERT", columns: ["kind", "member_id"] },
      { table_name: "support_messages", privilege_type: "INSERT", columns: ["author_id", "body", "ticket_id"] },
      { table_name: "support_tickets", privilege_type: "INSERT", columns: ["member_id", "subject"] },
    ]);
  });

  it("the provider authorization reference and card signature are not selectable by authenticated", async () => {
    const rows = await q<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'payment_methods' and grantee = 'authenticated' and privilege_type = 'SELECT'`,
    );
    const readable = rows.map((r) => r.column_name);
    expect(readable).not.toContain("provider_authorization_ref");
    expect(readable).not.toContain("provider_card_signature");
    expect(readable).not.toContain("authorization_email");
  });

  it("no function is executable by anon, and authenticated may run only my_balance", async () => {
    const rows = await q<{ proname: string; anon_ok: boolean; auth_ok: boolean }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'execute') as anon_ok,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'`,
    );
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.filter((r) => r.anon_ok).map((r) => r.proname)).toEqual([]);
    expect(rows.filter((r) => r.auth_ok).map((r) => r.proname)).toEqual(["my_balance"]);
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not coalesce((select bool_or(c like 'search_path=%') from unnest(p.proconfig) c), false)`,
    );
    expect(rows).toEqual([]);
  });
});
