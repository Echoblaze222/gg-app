import { describe, expect, it } from "vitest";
import type { Balance, ContributionObligation, ContributionPlan, Page, PaymentAttempt } from "../../contracts/entities";
import { AppError, type Result } from "../../contracts/errors";
import { balanceView } from "./balance";
import { buildHomeView, unreadBadge, type HomeInputs } from "./home";

const TODAY = "2026-11-14";
const M = "11111111-1111-4111-8111-111111111111";

const balance: Balance = { memberId: M, currency: "NGN", ledgerKobo: 150000, availableKobo: 150000, heldKobo: 0 };

function obligation(overrides: Partial<ContributionObligation> = {}): ContributionObligation {
  return {
    id: "ob-1",
    planId: "plan-1",
    memberId: M,
    dueOn: "2026-11-17",
    amountKobo: 500000,
    currency: "NGN",
    status: "scheduled",
    paidByAttemptId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function plan(overrides: Partial<ContributionPlan> = {}): ContributionPlan {
  return {
    id: "plan-1",
    memberId: M,
    frequency: "weekly",
    amountKobo: 500000,
    currency: "NGN",
    status: "active",
    startsOn: "2026-11-01",
    paymentMethodId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "at-1",
    memberId: M,
    purpose: "scheduled_contribution",
    channel: "card",
    amountKobo: 500000,
    currency: "NGN",
    status: "successful",
    reference: "ref-1",
    idempotencyKey: "idem-aaaaaaaaaaaaaaaa",
    obligationId: null,
    paymentMethodId: null,
    providerTransactionId: null,
    failureCode: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
    completedAt: "2026-11-10T10:01:00.000Z",
    ...overrides,
  };
}

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const page = (items: PaymentAttempt[]): Page<PaymentAttempt> => ({ items, nextCursor: null });
const failure = new AppError("SYSTEM_UNAVAILABLE", { reference: "req-9" }).toShape();
const bad = <T,>(): Result<T> => ({ ok: false, error: failure });

function inputs(overrides: Partial<HomeInputs> = {}): HomeInputs {
  return {
    today: TODAY,
    balance: ok(balance),
    nextDue: ok(obligation()),
    plans: ok([plan()]),
    recentAttempts: ok(page([])),
    unreadCount: ok(0),
    ...overrides,
  };
}

describe("balanceView", () => {
  it("formats a consistent balance", () => {
    const view = balanceView({ ...balance, ledgerKobo: 200000, availableKobo: 150000, heldKobo: 50000 });
    expect(view).toEqual({ kind: "ok", available: "\u20A61,500.00", ledger: "\u20A62,000.00", held: "\u20A6500.00", hasHold: true });
  });

  it.each([
    [{ ledgerKobo: 100, availableKobo: 100, heldKobo: 50 }],
    [{ ledgerKobo: -100, availableKobo: -100, heldKobo: 0 }],
    [{ ledgerKobo: 100.5, availableKobo: 100.5, heldKobo: 0 }],
    [{ ledgerKobo: 100, availableKobo: 150, heldKobo: -50 }],
  ])("shows no amount when the ledger rules are broken: %j", (patch) => {
    expect(balanceView({ ...balance, ...patch })).toEqual({ kind: "unverified" });
  });
});

describe("home next due", () => {
  it.each([
    ["2026-11-10", -4, "overdue"],
    ["2026-11-14", 0, "today"],
    ["2026-11-15", 1, "soon"],
    ["2026-11-17", 3, "soon"],
    ["2026-11-18", 4, "later"],
  ])("due on %s is %i days away and %s", (dueOn, days, urgency) => {
    const view = buildHomeView(inputs({ nextDue: ok(obligation({ dueOn })) }));
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due", daysUntil: days, urgency, amount: "\u20A65,000.00", canPay: true } });
  });

  it("shows the missed fact without inventing a consequence", () => {
    const view = buildHomeView(inputs({ nextDue: ok(obligation({ status: "missed", dueOn: "2026-11-07" })) }));
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due", missed: true, urgency: "overdue", canPay: true } });
  });

  it("blocks paying while a payment for the same obligation is in progress", () => {
    const view = buildHomeView(inputs({ recentAttempts: ok(page([attempt({ status: "processing", obligationId: "ob-1" })])) }));
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due", canPay: false, payBlockedReason: "A payment for this is already in progress. Do not pay again." } });
  });

  it("does not block for a finished or unrelated payment", () => {
    const view = buildHomeView(
      inputs({ recentAttempts: ok(page([attempt({ status: "failed", obligationId: "ob-1" }), attempt({ id: "at-2", status: "processing", obligationId: "other" })])) }),
    );
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due", canPay: true } });
  });

  it("does not allow paying when in progress payments could not be checked", () => {
    const view = buildHomeView(inputs({ recentAttempts: bad() }));
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due", canPay: false } });
    expect(view.pendingPayments.status).toBe("error");
  });

  it("still shows the due card when only the plans call failed", () => {
    const view = buildHomeView(inputs({ plans: bad() }));
    expect(view.nextDue).toMatchObject({ status: "ready", data: { kind: "due" } });
  });

  it("explains why nothing is due", () => {
    expect(buildHomeView(inputs({ nextDue: ok(null), plans: ok([]) })).nextDue).toEqual({ status: "ready", data: { kind: "none", reason: "no_plan" } });
    expect(buildHomeView(inputs({ nextDue: ok(null), plans: ok([plan({ status: "paused" })]) })).nextDue).toEqual({ status: "ready", data: { kind: "none", reason: "plan_paused" } });
    expect(buildHomeView(inputs({ nextDue: ok(null), plans: ok([plan()]) })).nextDue).toEqual({ status: "ready", data: { kind: "none", reason: "nothing_due" } });
    expect(buildHomeView(inputs({ nextDue: ok(obligation({ status: "paid" })), plans: ok([plan()]) })).nextDue).toEqual({ status: "ready", data: { kind: "none", reason: "nothing_due" } });
  });

  it("reports an error, not a guess, when nothing is due and plans are unknown", () => {
    expect(buildHomeView(inputs({ nextDue: ok(null), plans: bad() })).nextDue.status).toBe("error");
  });

  it("shows unavailable for a corrupt due date", () => {
    const view = buildHomeView(inputs({ nextDue: ok(obligation({ dueOn: "2026-02-30" })) }));
    expect(view.nextDue).toEqual({ status: "ready", data: { kind: "unavailable" } });
  });
});

describe("home sections fail alone", () => {
  it("a failing balance does not affect the other sections", () => {
    const view = buildHomeView(inputs({ balance: bad(), unreadCount: ok(12) }));
    expect(view.balance.status).toBe("error");
    expect(view.nextDue.status).toBe("ready");
    expect(view.unreadBadge).toEqual({ status: "ready", data: "9+" });
  });

  it("lists only in progress payments as pending", () => {
    const view = buildHomeView(
      inputs({ recentAttempts: ok(page([attempt({ id: "a", status: "verifying" }), attempt({ id: "b", status: "successful" }), attempt({ id: "c", status: "failed" })])) }),
    );
    expect(view.pendingPayments).toMatchObject({ status: "ready", data: [{ attemptId: "a", statusLabel: "Confirming" }] });
  });
});

describe("unreadBadge", () => {
  it.each([
    [0, null],
    [-3, null],
    [Number.NaN, null],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
    [250, "9+"],
  ])("%s unread shows %s", (count, expected) => {
    expect(unreadBadge(count)).toBe(expected);
  });
});
