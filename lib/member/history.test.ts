import { describe, expect, it } from "vitest";
import type { LedgerEntry, PaymentAttempt } from "../../contracts/entities";
import type { ReceiptData } from "../../contracts/services";
import { buildReceiptIndex, toHistoryRow } from "./history";
import { appendPage } from "./pages";
import { receiptView } from "./receipt";

const M = "11111111-1111-4111-8111-111111111111";

function attempt(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: "at-1",
    memberId: M,
    purpose: "one_time_contribution",
    channel: "bank_transfer",
    amountKobo: 250000,
    currency: "NGN",
    status: "successful",
    reference: "ref-1",
    idempotencyKey: "idem-aaaaaaaaaaaaaaaa",
    obligationId: null,
    paymentMethodId: null,
    providerTransactionId: null,
    failureCode: null,
    createdAt: "2026-11-14T23:30:00.000Z",
    updatedAt: "2026-11-14T23:30:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function credit(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "le-1",
    memberId: M,
    entryType: "contribution_credit",
    direction: "credit",
    amountKobo: 250000,
    currency: "NGN",
    paymentAttemptId: "at-1",
    payoutId: null,
    refundId: null,
    reason: null,
    receiptNumber: "GG-0001",
    createdBy: null,
    createdAt: "2026-11-14T23:31:00.000Z",
    ...overrides,
  };
}

describe("history rows", () => {
  it("links to the receipt only for a successful payment with a receipt number", () => {
    const row = toHistoryRow(attempt(), "GG-0001");
    expect(row.href).toBe("/app/history/GG-0001");
    expect(row.receiptNumber).toBe("GG-0001");
    expect(row.amount).toBe("\u20A62,500.00");
    expect(row.dateLagos).toBe("2026-11-15");
    expect(row.channelLabel).toBe("Bank transfer");
  });

  it.each([["failed"], ["processing"], ["verifying"], ["reversed"], ["cancelled"], ["expired"]] as const)("never links a %s payment, even with a receipt number", (status) => {
    const row = toHistoryRow(attempt({ status }), "GG-0001");
    expect(row.href).toBeNull();
    expect(row.receiptNumber).toBeNull();
  });

  it("shows a successful payment without a link when no receipt is known", () => {
    expect(toHistoryRow(attempt(), null).href).toBeNull();
    expect(toHistoryRow(attempt(), "").href).toBeNull();
  });

  it("encodes the receipt number so it cannot change the path", () => {
    expect(toHistoryRow(attempt(), "GG/../x?y").href).toBe("/app/history/GG%2F..%2Fx%3Fy");
  });

  it("shows contract copy for a known failure and nothing for an unknown one", () => {
    expect(toHistoryRow(attempt({ status: "failed", failureCode: "PAYMENT_DECLINED" }), null).failure?.message).toContain("declined");
    expect(toHistoryRow(attempt({ status: "failed", failureCode: "raw provider text" }), null).failure).toBeNull();
    expect(toHistoryRow(attempt({ status: "successful", failureCode: "PAYMENT_DECLINED" }), "GG-1").failure).toBeNull();
  });

  it("throws on a corrupt amount rather than showing a wrong one", () => {
    expect(() => toHistoryRow(attempt({ amountKobo: -5 }), null)).toThrow(RangeError);
  });
});

describe("receipt index", () => {
  it("maps contribution credits to attempts and ignores everything else", () => {
    const index = buildReceiptIndex([
      credit(),
      credit({ id: "le-2", paymentAttemptId: "at-2", receiptNumber: null }),
      credit({ id: "le-3", entryType: "payout_debit", direction: "debit", paymentAttemptId: "at-3", receiptNumber: "GG-0003" }),
      credit({ id: "le-4", paymentAttemptId: null, receiptNumber: "GG-0004" }),
    ]);
    expect([...index.entries()]).toEqual([["at-1", "GG-0001"]]);
  });
});

describe("appendPage", () => {
  it("adds new items at the end without duplicates or reordering", () => {
    const result = appendPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }, { id: "c" }]);
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("receiptView", () => {
  const data: ReceiptData = {
    receiptNumber: "GG-0001",
    memberId: M,
    memberName: "Ada Obi",
    amountKobo: 250000,
    currency: "NGN",
    channel: "card",
    providerReference: "ref-1",
    paidAt: "2026-11-14T23:30:00.000Z",
    balanceAfterKobo: 750000,
  };

  it("formats amounts and shows the Lagos date and time", () => {
    expect(receiptView(data)).toEqual({
      receiptNumber: "GG-0001",
      memberName: "Ada Obi",
      amount: "\u20A62,500.00",
      balanceAfter: "\u20A67,500.00",
      paidOn: "2026-11-15",
      paidAtTime: "00:30",
      channelLabel: "Card",
      providerReference: "ref-1",
    });
  });

  it("returns null instead of a receipt with a bad number or date", () => {
    expect(receiptView({ ...data, amountKobo: 0 })).toBeNull();
    expect(receiptView({ ...data, amountKobo: -100 })).toBeNull();
    expect(receiptView({ ...data, balanceAfterKobo: -1 })).toBeNull();
    expect(receiptView({ ...data, paidAt: "garbage" })).toBeNull();
  });

  it("allows a receipt with no channel", () => {
    expect(receiptView({ ...data, channel: null })?.channelLabel).toBeNull();
  });
});
