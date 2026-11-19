import { describe, expect, it } from "vitest";
import {
  FEE_BEARER_SETTING_KEY,
  PROVIDER_TX_STATUSES,
  evaluateVerification,
  isProviderTxStatus,
  parseFeeBearer,
  type ExpectedPayment,
  type ProviderVerification,
} from "./verification";

const expected: ExpectedPayment = { reference: "gg-0123456789ABCDEFGHJK", amountKobo: 250_000, currency: "NGN" };

function provider(overrides: Partial<ProviderVerification> = {}): ProviderVerification {
  return { reference: expected.reference, status: "success", amountKobo: expected.amountKobo, currency: "NGN", ...overrides };
}

describe("success", () => {
  it("settles when reference, currency and amount all match", () => {
    expect(evaluateVerification(expected, provider())).toEqual({ kind: "settle" });
  });

  it("accepts a currency that differs only by letter case", () => {
    expect(evaluateVerification(expected, provider({ currency: "ngn" }))).toEqual({ kind: "settle" });
  });

  it("A2: a lower amount is a mismatch, not a settlement", () => {
    expect(evaluateVerification(expected, provider({ amountKobo: expected.amountKobo - 1 }))).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("A2: a higher amount is a mismatch too", () => {
    expect(evaluateVerification(expected, provider({ amountKobo: expected.amountKobo + 1 }))).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("A2: a non integer, negative or non finite amount is a mismatch", () => {
    for (const amountKobo of [250_000.5, -250_000, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
      expect(evaluateVerification(expected, provider({ amountKobo }))).toEqual({ kind: "mismatch", reason: "amount" });
    }
  });

  it("A2: a different currency is a mismatch even when the number matches", () => {
    expect(evaluateVerification(expected, provider({ currency: "USD" }))).toEqual({ kind: "mismatch", reason: "currency" });
    expect(evaluateVerification(expected, provider({ currency: "" }))).toEqual({ kind: "mismatch", reason: "currency" });
  });

  it("A2: a different reference is a mismatch", () => {
    expect(evaluateVerification(expected, provider({ reference: "gg-ZZZZZZZZZZZZZZZZZZZZ" }))).toEqual({ kind: "mismatch", reason: "reference" });
  });
});

describe("fee bearer setting", () => {
  // Shape taken from the Paystack verify sample: amount 40333 = requested_amount 30050 + fees 10283.
  const withFees = { amountKobo: 260_283, requestedAmountKobo: 250_000, feesKobo: 10_283 };
  const asCustomer = (patch: Partial<ProviderVerification>) => evaluateVerification(expected, provider(patch), "customer");

  it("parseFeeBearer is strict: only the exact word customer relaxes the rule", () => {
    expect(parseFeeBearer("customer")).toBe("customer");
    for (const value of ["merchant", "", "Customer", "CUSTOMER", " customer", "both", "either", null, undefined, 1, true, {}]) {
      expect(parseFeeBearer(value)).toBe("merchant");
    }
    expect(FEE_BEARER_SETTING_KEY).toBe("payment.fee_bearer");
  });

  it("merchant (also the default) rejects a total that includes fees", () => {
    expect(evaluateVerification(expected, provider(withFees))).toEqual({ kind: "mismatch", reason: "amount" });
    expect(evaluateVerification(expected, provider(withFees), "merchant")).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("merchant still settles an exact amount, even when the provider reports fees", () => {
    expect(evaluateVerification(expected, provider({ requestedAmountKobo: 250_000, feesKobo: 10_283 }), "merchant")).toEqual({ kind: "settle" });
  });

  it("customer settles when the total is exactly the requested amount plus fees", () => {
    expect(asCustomer(withFees)).toEqual({ kind: "settle" });
  });

  it("customer is a mismatch when the total does not equal requested plus fees", () => {
    expect(asCustomer({ ...withFees, amountKobo: 260_284 })).toEqual({ kind: "mismatch", reason: "amount" });
    expect(asCustomer({ ...withFees, amountKobo: 260_282 })).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("customer is a mismatch when the requested amount is not the one we asked for", () => {
    expect(asCustomer({ amountKobo: 260_283, requestedAmountKobo: 249_999, feesKobo: 10_284 })).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("customer is a mismatch when requested amount or fees are missing, null or invalid", () => {
    expect(asCustomer({ amountKobo: 260_283 })).toEqual({ kind: "mismatch", reason: "amount" });
    expect(asCustomer({ amountKobo: 260_283, requestedAmountKobo: 250_000, feesKobo: null })).toEqual({ kind: "mismatch", reason: "amount" });
    expect(asCustomer({ amountKobo: 260_283, requestedAmountKobo: null, feesKobo: 10_283 })).toEqual({ kind: "mismatch", reason: "amount" });
    expect(asCustomer({ amountKobo: 260_283, requestedAmountKobo: 250_000, feesKobo: -10_283 })).toEqual({ kind: "mismatch", reason: "amount" });
    expect(asCustomer({ amountKobo: 260_283.5, requestedAmountKobo: 250_000, feesKobo: 10_283.5 })).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("customer still accepts an exact match when the provider also reports requested amount and fees", () => {
    expect(asCustomer({ requestedAmountKobo: 250_000, feesKobo: 0 })).toEqual({ kind: "settle" });
  });

  it("a different currency is a mismatch under either setting", () => {
    expect(asCustomer({ ...withFees, currency: "USD" })).toEqual({ kind: "mismatch", reason: "currency" });
    expect(evaluateVerification(expected, provider({ currency: "USD" }), "merchant")).toEqual({ kind: "mismatch", reason: "currency" });
  });

  it("reversed follows the same amount rule under each setting", () => {
    expect(asCustomer({ ...withFees, status: "reversed" })).toEqual({ kind: "reversed" });
    expect(evaluateVerification(expected, provider({ ...withFees, status: "reversed" }), "merchant")).toEqual({ kind: "mismatch", reason: "amount" });
  });

  it("only a fully matching success settles under customer too", () => {
    let settled = 0;
    for (const status of [...PROVIDER_TX_STATUSES, "pending", ""]) {
      for (const amountKobo of [250_000, 260_283, 250_001, 0]) {
        for (const reference of [expected.reference, "other"]) {
          const d = evaluateVerification(expected, { reference, status, currency: "NGN", amountKobo, requestedAmountKobo: 250_000, feesKobo: 10_283 }, "customer");
          if (d.kind === "settle") {
            settled += 1;
            expect(status).toBe("success");
            expect(reference).toBe(expected.reference);
            expect([250_000, 260_283]).toContain(amountKobo);
          }
        }
      }
    }
    expect(settled).toBe(2);
  });
});

describe("reference is checked before status", () => {
  it.each([...PROVIDER_TX_STATUSES, "something_new"])("a %s answer for another reference is never trusted", (status) => {
    expect(evaluateVerification(expected, provider({ status, reference: "other" }))).toEqual({ kind: "mismatch", reason: "reference" });
  });
});

describe("other provider statuses", () => {
  it("failed maps to a decline code and never settles", () => {
    expect(evaluateVerification(expected, provider({ status: "failed" }))).toEqual({ kind: "fail", failureCode: "PAYMENT_DECLINED" });
  });

  it("a failed answer with a different amount still just fails, nothing is credited", () => {
    expect(evaluateVerification(expected, provider({ status: "failed", amountKobo: 1 })).kind).toBe("fail");
  });

  it("abandoned waits", () => {
    expect(evaluateVerification(expected, provider({ status: "abandoned" }))).toEqual({ kind: "wait", reason: "abandoned" });
  });

  it("ongoing waits", () => {
    expect(evaluateVerification(expected, provider({ status: "ongoing" }))).toEqual({ kind: "wait", reason: "ongoing" });
  });

  it("reversed is reported only when the money matches", () => {
    expect(evaluateVerification(expected, provider({ status: "reversed" }))).toEqual({ kind: "reversed" });
    expect(evaluateVerification(expected, provider({ status: "reversed", amountKobo: 5 }))).toEqual({ kind: "mismatch", reason: "amount" });
  });
});

describe("unknown statuses are never success", () => {
  it.each(["", "SUCCESS", "Success", "successful", "pending", "queued", "paid", "ok", "true", "success ", "something_new"])(
    "treats %j as still in progress",
    (status) => {
      expect(evaluateVerification(expected, provider({ status }))).toEqual({ kind: "wait", reason: "unknown_status" });
    },
  );

  it("isProviderTxStatus is exact", () => {
    expect(isProviderTxStatus("success")).toBe(true);
    expect(isProviderTxStatus("Success")).toBe(false);
  });
});

describe("settle is the only decision that allows a credit", () => {
  it("across a grid of statuses, references, currencies and amounts only the fully matching success settles", () => {
    const statuses = [...PROVIDER_TX_STATUSES, "pending", ""];
    const references = [expected.reference, "other"];
    const currencies = ["NGN", "USD"];
    const amounts = [expected.amountKobo, expected.amountKobo + 1, 0];
    let settled = 0;
    for (const status of statuses) {
      for (const reference of references) {
        for (const currency of currencies) {
          for (const amountKobo of amounts) {
            const decision = evaluateVerification(expected, { reference, status, currency, amountKobo });
            if (decision.kind === "settle") {
              settled += 1;
              expect({ status, reference, currency, amountKobo }).toEqual({ status: "success", reference: expected.reference, currency: "NGN", amountKobo: expected.amountKobo });
            }
          }
        }
      }
    }
    expect(settled).toBe(1);
  });
});
