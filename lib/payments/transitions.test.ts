import { describe, expect, it } from "vitest";
import { OBLIGATION_STATUSES, PAYMENT_ATTEMPT_STATUSES, PAYOUT_STATUSES, REFUND_STATUSES, type PaymentAttemptStatus } from "@/contracts/enums";
import {
  OBLIGATION_TRANSITIONS,
  PAYMENT_ATTEMPT_TERMINAL,
  PAYMENT_ATTEMPT_TRANSITIONS,
  PAYOUT_TRANSITIONS,
  REFUND_TRANSITIONS,
} from "@/contracts/state-machines";
import {
  canObligationTransition,
  canPaymentTransition,
  canPayoutTransition,
  canRefundTransition,
  isLegalPaymentPath,
  isSettlementClosed,
  pathToExpired,
  pathToVerifying,
} from "./transitions";

describe("guards agree with the frozen tables for every pair", () => {
  it("payment attempt", () => {
    for (const from of PAYMENT_ATTEMPT_STATUSES) {
      for (const to of PAYMENT_ATTEMPT_STATUSES) {
        expect(canPaymentTransition(from, to)).toBe(PAYMENT_ATTEMPT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("obligation", () => {
    for (const from of OBLIGATION_STATUSES) {
      for (const to of OBLIGATION_STATUSES) {
        expect(canObligationTransition(from, to)).toBe(OBLIGATION_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("payout", () => {
    for (const from of PAYOUT_STATUSES) {
      for (const to of PAYOUT_STATUSES) {
        expect(canPayoutTransition(from, to)).toBe(PAYOUT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("refund", () => {
    for (const from of REFUND_STATUSES) {
      for (const to of REFUND_STATUSES) {
        expect(canRefundTransition(from, to)).toBe(REFUND_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("no state may transition to itself", () => {
    for (const s of PAYMENT_ATTEMPT_STATUSES) expect(canPaymentTransition(s, s)).toBe(false);
    for (const s of OBLIGATION_STATUSES) expect(canObligationTransition(s, s)).toBe(false);
    for (const s of PAYOUT_STATUSES) expect(canPayoutTransition(s, s)).toBe(false);
    for (const s of REFUND_STATUSES) expect(canRefundTransition(s, s)).toBe(false);
  });
});

describe("payment attempt structure the settlement code relies on", () => {
  it("terminal states have no way out", () => {
    for (const s of PAYMENT_ATTEMPT_TERMINAL) expect(PAYMENT_ATTEMPT_TRANSITIONS[s]).toEqual([]);
  });

  it("successful is reachable only from verifying and can only become reversed", () => {
    const into = PAYMENT_ATTEMPT_STATUSES.filter((from) => canPaymentTransition(from, "successful"));
    expect(into).toEqual(["verifying"]);
    expect(PAYMENT_ATTEMPT_TRANSITIONS.successful).toEqual(["reversed"]);
  });

  it("verifying is reachable only from processing", () => {
    const into = PAYMENT_ATTEMPT_STATUSES.filter((from) => canPaymentTransition(from, "verifying"));
    expect(into).toEqual(["processing"]);
  });

  it("every status is reachable from initiating", () => {
    const seen = new Set<PaymentAttemptStatus>(["initiating"]);
    const queue: PaymentAttemptStatus[] = ["initiating"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of PAYMENT_ATTEMPT_TRANSITIONS[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...PAYMENT_ATTEMPT_STATUSES].sort());
  });
});

describe("isSettlementClosed", () => {
  it("is true for terminal states and for successful", () => {
    for (const s of ["failed", "cancelled", "expired", "reversed", "successful"] as const) {
      expect(isSettlementClosed(s)).toBe(true);
    }
  });

  it("is false while an attempt is still in flight", () => {
    for (const s of ["initiating", "awaiting_authentication", "processing", "verifying"] as const) {
      expect(isSettlementClosed(s)).toBe(false);
    }
  });
});

describe("pathToVerifying", () => {
  it("passes through processing from earlier states, because the contract allows verifying only from processing", () => {
    expect(pathToVerifying("initiating")).toEqual(["processing", "verifying"]);
    expect(pathToVerifying("awaiting_authentication")).toEqual(["processing", "verifying"]);
    expect(pathToVerifying("processing")).toEqual(["verifying"]);
    expect(pathToVerifying("verifying")).toEqual([]);
  });

  it("returns null for states that cannot settle", () => {
    for (const s of ["successful", "failed", "cancelled", "expired", "reversed"] as const) {
      expect(pathToVerifying(s)).toBeNull();
    }
  });

  it("every returned path is made of legal edges and ends at verifying", () => {
    for (const from of PAYMENT_ATTEMPT_STATUSES) {
      const path = pathToVerifying(from);
      if (path === null) continue;
      expect(isLegalPaymentPath(from, path)).toBe(true);
      expect(path.length === 0 ? from : path[path.length - 1]).toBe("verifying");
    }
  });
});

describe("pathToExpired", () => {
  it("expires directly from the early states and steps back from verifying", () => {
    expect(pathToExpired("initiating")).toEqual(["expired"]);
    expect(pathToExpired("awaiting_authentication")).toEqual(["expired"]);
    expect(pathToExpired("processing")).toEqual(["expired"]);
    expect(pathToExpired("verifying")).toEqual(["processing", "expired"]);
  });

  it("returns null for states that cannot expire", () => {
    for (const s of ["successful", "failed", "cancelled", "expired", "reversed"] as const) {
      expect(pathToExpired(s)).toBeNull();
    }
  });

  it("every returned path is made of legal edges and ends at expired", () => {
    for (const from of PAYMENT_ATTEMPT_STATUSES) {
      const path = pathToExpired(from);
      if (path === null) continue;
      expect(isLegalPaymentPath(from, path)).toBe(true);
      expect(path[path.length - 1]).toBe("expired");
    }
  });
});

describe("isLegalPaymentPath", () => {
  it("accepts the happy path and rejects shortcuts", () => {
    expect(isLegalPaymentPath("initiating", ["awaiting_authentication", "processing", "verifying", "successful"])).toBe(true);
    expect(isLegalPaymentPath("initiating", ["successful"])).toBe(false);
    expect(isLegalPaymentPath("awaiting_authentication", ["verifying"])).toBe(false);
    expect(isLegalPaymentPath("failed", ["processing"])).toBe(false);
    expect(isLegalPaymentPath("successful", ["reversed"])).toBe(true);
    expect(isLegalPaymentPath("verifying", [])).toBe(true);
  });
});
