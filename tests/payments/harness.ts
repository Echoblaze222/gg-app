/**
 * Wires the in memory store, the fake provider and fake collaborators into the M3 payment module.
 * Test only. No key is held: the webhook secret is built at runtime and never written down as a literal.
 */
import { createHmac, randomBytes } from "node:crypto";
import { AppError, type Result } from "@/contracts/errors";
import type { DomainEvent } from "@/contracts/events";
import type { Notification } from "@/contracts/entities";
import type { InitiatePaymentInput, RequestContext, SessionInfo } from "@/contracts/services";
import type { PermissionName } from "@/contracts/permissions";
import { createHmacWebhookVerifier } from "@/lib/security/webhook";
import { createPaymentModule, type PaymentServiceDeps } from "@/lib/payments/service";
import { FakeProvider } from "./fake-provider";
import { MemoryStore } from "./memory";

export interface LogLine {
  level: "warn" | "error";
  event: string;
  fields: Record<string, string | number | boolean | null> | undefined;
}

export interface HarnessOptions {
  /** Skip seeding the money limits to test failing closed. */
  withoutLimits?: boolean;
}

export const MIN_KOBO = 10_000; // NGN 100
export const MAX_KOBO = 50_000_000; // NGN 500,000
export const AMOUNT = 500_000; // NGN 5,000

export function createHarness(options: HarnessOptions = {}) {
  const store = new MemoryStore();
  const provider = new FakeProvider();

  const memberId = store.id();
  store.membersMap.set(memberId, { id: memberId, email: "member@example.com", status: "active" });
  if (!options.withoutLimits) {
    store.settingsMap.set("contribution.min_kobo", String(MIN_KOBO));
    store.settingsMap.set("contribution.max_kobo", String(MAX_KOBO));
  }

  const published: DomainEvent[] = [];
  const notified: Array<{ memberId: string; type: string; body: string }> = [];
  const securityRecorded: Array<{ type: string; severity: string }> = [];
  const logs: LogLine[] = [];
  const rateLimited = new Set<string>();
  const denied = new Set<string>();
  let busFails = false;
  let notifyFails = false;

  const secret = ["whsec", randomBytes(24).toString("hex")].join("_");
  const verifier = createHmacWebhookVerifier({ algorithm: "sha512", encoding: "hex" });
  const sign = (rawBody: string): string => createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");

  const ctx: RequestContext = { requestId: "req-test-1", actorId: memberId, ip: "203.0.113.7", userAgent: "vitest" };
  const anonymous: RequestContext = { requestId: "req-test-2", actorId: null, ip: "203.0.113.8", userAgent: "vitest" };
  const ctxFor = (actorId: string, requestId = "req-other"): RequestContext => ({ requestId, actorId, ip: null, userAgent: null });

  const deps: PaymentServiceDeps = {
    repos: {
      members: store.members,
      attempts: store.attempts,
      ledger: store.ledger,
      obligations: store.obligations,
      methods: store.methods,
      events: store.events,
      reconciliation: store.reconciliation,
      settings: store.settings,
    },
    provider,
    authz: {
      async requirePermission(c, permission: PermissionName): Promise<Result<SessionInfo>> {
        if (c.actorId === null) return { ok: false, error: new AppError("AUTH_SESSION_EXPIRED", { reference: c.requestId }).toShape() };
        if (denied.has(permission)) return { ok: false, error: new AppError("PERMISSION_DENIED", { reference: c.requestId }).toShape() };
        return { ok: true, value: { memberId: c.actorId, roles: ["member"], recentlyReauthenticated: false, mfaVerified: false } };
      },
    },
    rateLimiter: {
      async check(c, rule) {
        if (rateLimited.has(rule.name)) return { ok: false, error: new AppError("RATE_LIMITED", { reference: c.requestId }).toShape() };
        return { ok: true, value: { remaining: rule.limit } };
      },
    },
    bus: {
      async publish(event) {
        if (busFails) throw new Error("bus down");
        published.push(event as DomainEvent);
      },
    },
    notifications: {
      async notify(_c, input) {
        if (notifyFails) throw new Error("notify down");
        notified.push({ memberId: input.memberId, type: input.type, body: input.body });
        return { ok: true, value: {} as Notification };
      },
    },
    securityEvents: {
      async record(_c, event) {
        securityRecorded.push({ type: event.type, severity: event.severity });
      },
    },
    verifyWebhookSignature: ({ rawBody, signatureHeader }) => verifier.verify({ rawBody, signatureHeader, secret }),
    appUrl: "https://gg.example.test",
    log: {
      warn: (event, fields) => void logs.push({ level: "warn", event, fields: fields as LogLine["fields"] }),
      error: (event, fields) => void logs.push({ level: "error", event, fields: fields as LogLine["fields"] }),
    },
    now: () => store.now,
    newId: () => store.id(),
  };

  const mod = createPaymentModule(deps);

  const input = (overrides: Partial<InitiatePaymentInput> = {}): InitiatePaymentInput => ({
    purpose: "one_time_contribution",
    amountKobo: AMOUNT,
    idempotencyKey: `key_${randomBytes(8).toString("hex")}`,
    ...overrides,
  });

  async function start(overrides: Partial<InitiatePaymentInput> = {}) {
    const result = await mod.payments.initiate(ctx, input(overrides));
    if (!result.ok) throw new Error(`initiate failed: ${result.error.code}`);
    return result.value;
  }

  function seedObligation(patch: { status?: "scheduled" | "due" | "paid" | "missed" | "cancelled"; amountKobo?: number; memberId?: string } = {}) {
    const id = store.id();
    const now = store.iso();
    const obligation = {
      id,
      planId: store.id(),
      memberId: patch.memberId ?? memberId,
      dueOn: "2026-11-17",
      amountKobo: patch.amountKobo ?? AMOUNT,
      currency: "NGN" as const,
      status: patch.status ?? ("due" as const),
      paidByAttemptId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.obligationsMap.set(id, obligation);
    return obligation;
  }

  /** What the provider's webhook looks like, including the card fields we must never store. */
  function chargeSuccessBody(reference: string, extra: Record<string, unknown> = {}, id: number | string = 4099260516): string {
    return JSON.stringify({
      event: "charge.success",
      data: {
        id,
        status: "success",
        reference,
        amount: 123, // deliberately wrong: the body amount must never be used (A3)
        currency: "NGN",
        authorization: { authorization_code: "AUTH_secret0001", signature: "SIG_secret0001", last4: "4081", bin: "408408" },
        customer: { email: "member@example.com", customer_code: "CUS_x" },
        ...extra,
      },
    });
  }

  const receive = (rawBody: string, signatureHeader: string | null = sign(rawBody)) => mod.webhooks.receive(anonymous, { rawBody, signatureHeader });

  return {
    store,
    provider,
    deps,
    module: mod,
    payments: mod.payments,
    webhooks: mod.webhooks,
    settler: mod.settler,
    memberId,
    ctx,
    anonymous,
    ctxFor,
    published,
    notified,
    securityRecorded,
    logs,
    rateLimited,
    denied,
    setBusFails: (v: boolean) => void (busFails = v),
    setNotifyFails: (v: boolean) => void (notifyFails = v),
    sign,
    input,
    start,
    seedObligation,
    chargeSuccessBody,
    receive,
    eventNames: () => published.map((e) => e.name),
  };
}

export type Harness = ReturnType<typeof createHarness>;
