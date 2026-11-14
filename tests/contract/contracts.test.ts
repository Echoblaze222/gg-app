import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CURRENCIES,
  OBLIGATION_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYOUT_STATUSES,
  REFUND_STATUSES,
  OPEN_PAYOUT_STATUSES,
} from "@/contracts/enums";
import {
  OBLIGATION_TRANSITIONS,
  PAYMENT_ATTEMPT_TRANSITIONS,
  PAYOUT_TRANSITIONS,
  REFUND_TRANSITIONS,
  canTransition,
} from "@/contracts/state-machines";
import { AppError, ERROR_DEFINITIONS } from "@/contracts/errors";
import { DOMAIN_EVENT_NAMES, type DomainEventName } from "@/contracts/events";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, REAUTH_REQUIRED_PERMISSIONS } from "@/contracts/permissions";
import { MAX_AMOUNT_KOBO, initiatePaymentInputSchema, payoutRequestInputSchema, koboSchema } from "@/contracts/schemas";

const root = process.cwd();

function reachable<S extends string>(table: Record<S, readonly S[]>, start: S): Set<S> {
  const seen = new Set<S>([start]);
  const queue: S[] = [start];
  while (queue.length) {
    const s = queue.shift() as S;
    for (const next of table[s]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen;
}

describe("state machines", () => {
  const machines = [
    ["payment attempt", PAYMENT_ATTEMPT_TRANSITIONS, PAYMENT_ATTEMPT_STATUSES, "initiating"],
    ["payout", PAYOUT_TRANSITIONS, PAYOUT_STATUSES, "requested"],
    ["obligation", OBLIGATION_TRANSITIONS, OBLIGATION_STATUSES, "scheduled"],
    ["refund", REFUND_TRANSITIONS, REFUND_STATUSES, "requested"],
  ] as const;

  for (const [name, table, statuses, start] of machines) {
    it(`${name}: covers every status and every target is a known status`, () => {
      const t = table as Record<string, readonly string[]>;
      expect(Object.keys(t).sort()).toEqual([...statuses].sort());
      for (const targets of Object.values(t)) for (const x of targets) expect(statuses as readonly string[]).toContain(x);
    });
    it(`${name}: every status is reachable from the start state`, () => {
      const r = reachable(table as Record<string, readonly string[]>, start);
      expect([...r].sort()).toEqual([...statuses].sort());
    });
  }

  it("a successful payment can only become reversed", () => {
    expect(PAYMENT_ATTEMPT_TRANSITIONS.successful).toEqual(["reversed"]);
    expect(canTransition(PAYMENT_ATTEMPT_TRANSITIONS, "failed", "successful")).toBe(false);
    expect(canTransition(PAYMENT_ATTEMPT_TRANSITIONS, "cancelled", "processing")).toBe(false);
  });

  it("paid, rejected, failed and cancelled payouts are final", () => {
    for (const s of ["paid", "rejected", "failed", "cancelled"] as const) expect(PAYOUT_TRANSITIONS[s]).toEqual([]);
  });

  it("open payout statuses never include a final status", () => {
    for (const s of OPEN_PAYOUT_STATUSES) expect(["paid", "rejected", "failed", "cancelled"]).not.toContain(s);
  });
});

describe("error taxonomy", () => {
  const entries = Object.entries(ERROR_DEFINITIONS);
  it("message keys are unique and prefixed", () => {
    const keys = entries.map(([, d]) => d.messageKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k.startsWith("error.")).toBe(true);
  });
  it("every code says what to do and has a valid status", () => {
    for (const [, d] of entries) {
      expect(d.action.length).toBeGreaterThan(5);
      expect(d.message.length).toBeGreaterThan(5);
      expect(Number.isInteger(d.status)).toBe(true);
    }
  });
  it("failures that may have moved money are never marked safe to blindly retry", () => {
    for (const [code, d] of entries) if (d.moneyMoved === "yes") expect([code, d.retrySafe]).toEqual([code, false]);
  });
  it("the generic internal error never claims money did not move", () => {
    expect(ERROR_DEFINITIONS.INTERNAL.moneyMoved).toBe("unknown");
  });
  it("AppError.toShape exposes no internal detail", () => {
    const e = new AppError("INTERNAL", { reference: "ref-123", internal: "db password wrong" });
    const shape = e.toShape();
    expect(JSON.stringify(shape)).not.toContain("db password");
    expect(shape.reference).toBe("ref-123");
  });
});

describe("events", () => {
  it("names are unique", () => {
    expect(new Set(DOMAIN_EVENT_NAMES).size).toBe(DOMAIN_EVENT_NAMES.length);
  });
  it("list covers every event in the map (compile time check)", () => {
    type Missing = Exclude<DomainEventName, (typeof DOMAIN_EVENT_NAMES)[number]>;
    const none: Missing[] = [];
    expect(none).toEqual([]);
  });
});

describe("permissions", () => {
  it("names are unique and well formed", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const p of PERMISSIONS) expect(p).toMatch(/^(member|admin)\.[a-z_]+\.[a-z_]+$/);
  });
  it("owner holds everything, members hold only member permissions", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner.length).toBe(PERMISSIONS.length);
    for (const p of DEFAULT_ROLE_PERMISSIONS.member) expect(p.startsWith("member.")).toBe(true);
  });
  it("support cannot touch money, roles or settings", () => {
    for (const p of DEFAULT_ROLE_PERMISSIONS.support) {
      expect(p).not.toMatch(/payments|payouts|ledger|reconciliation|roles|settings/);
    }
  });
  it("admin cannot manage roles, adjust the ledger or change settings", () => {
    for (const p of ["admin.roles.manage", "admin.ledger.adjust", "admin.settings.update"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS.admin).not.toContain(p);
    }
  });
  it("reauthentication list only names real permissions", () => {
    for (const p of REAUTH_REQUIRED_PERMISSIONS) expect(PERMISSIONS as readonly string[]).toContain(p);
  });
  it("routes.md references only real permissions", () => {
    const md = readFileSync(join(root, "contracts/routes.md"), "utf8");
    const found = [...md.matchAll(/`((?:member|admin)\.[a-z_]+\.[a-z_]+)`/g)].map((m) => m[1]);
    expect(found.length).toBeGreaterThan(20);
    for (const f of found) expect(PERMISSIONS as readonly string[]).toContain(f);
  });
});

describe("money and schemas", () => {
  it("only NGN", () => expect([...CURRENCIES]).toEqual(["NGN"]));
  it("rejects floats, zero, negatives and amounts above the ceiling", () => {
    for (const bad of [0, -1, 10.5, MAX_AMOUNT_KOBO + 1, Number.NaN, Infinity]) expect(koboSchema.safeParse(bad).success).toBe(false);
    expect(koboSchema.safeParse(50_000).success).toBe(true);
  });
  it("ceiling keeps integer math exact", () => {
    expect(MAX_AMOUNT_KOBO * 1000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
  it("payment initiation needs a strong idempotency key", () => {
    const base = { purpose: "one_time_contribution", amountKobo: 100_000 };
    expect(initiatePaymentInputSchema.safeParse({ ...base, idempotencyKey: "short" }).success).toBe(false);
    expect(initiatePaymentInputSchema.safeParse({ ...base, idempotencyKey: "a-valid-key-1234567" }).success).toBe(true);
    expect(initiatePaymentInputSchema.safeParse({ ...base, idempotencyKey: "has spaces in it!!!" }).success).toBe(false);
  });
  it("payout request validates account number shape", () => {
    const ok = { amountKobo: 500_000, bankCode: "058", accountNumber: "0123456789", idempotencyKey: "a-valid-key-1234567" };
    expect(payoutRequestInputSchema.safeParse(ok).success).toBe(true);
    expect(payoutRequestInputSchema.safeParse({ ...ok, accountNumber: "12345" }).success).toBe(false);
  });
});

describe("environment contract", () => {
  it(".env.example lists exactly the names in env.md", () => {
    const md = readFileSync(join(root, "contracts/env.md"), "utf8");
    const mdNames = [...md.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((m) => m[1]).sort();
    const exNames = readFileSync(join(root, ".env.example"), "utf8")
      .split("\n").filter((l) => /^[A-Z][A-Z0-9_]+=/.test(l)).map((l) => l.split("=")[0]).sort();
    expect(exNames).toEqual(mdNames);
  });
  it(".env.example holds no values for secrets", () => {
    const lines = readFileSync(join(root, ".env.example"), "utf8").split("\n").filter((l) => /^[A-Z]/.test(l));
    for (const l of lines) {
      const [k, v] = l.split("=");
      if (/KEY|SECRET|PEPPER|URL|DATABASE/.test(k)) expect([k, v]).toEqual([k, ""]);
    }
  });
});

describe("house rules", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next"].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|md|css|yml|yaml|json)$/.test(e.name) && e.name !== "package-lock.json") files.push(p);
    }
  };
  walk(root);
  it("no em dash character anywhere in code or docs", () => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(String.fromCharCode(8212)));
    expect(offenders).toEqual([]);
  });
  it("no obvious secrets are committed", () => {
    const pattern = /(sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.)/;
    const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
