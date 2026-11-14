import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_KOBO } from "@/contracts/schemas";
import { addKobo, assertKobo, balanceOf, formatNairaPlain, isKobo, isPositiveKobo, nairaToKobo, signedKobo, subKobo } from "./money";

describe("isKobo and isPositiveKobo", () => {
  it("accepts zero and positive safe integers", () => {
    expect(isKobo(0)).toBe(true);
    expect(isKobo(150_000)).toBe(true);
    expect(isKobo(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it.each([-1, 0.5, 1.0000001, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "100", null, undefined, {}])(
    "rejects %s",
    (value) => {
      expect(isKobo(value)).toBe(false);
    },
  );

  it("positive kobo excludes zero and anything above the hard ceiling", () => {
    expect(isPositiveKobo(0)).toBe(false);
    expect(isPositiveKobo(1)).toBe(true);
    expect(isPositiveKobo(MAX_AMOUNT_KOBO)).toBe(true);
    expect(isPositiveKobo(MAX_AMOUNT_KOBO + 1)).toBe(false);
  });

  it("assertKobo throws RangeError on a float", () => {
    expect(() => assertKobo(10.5)).toThrow(RangeError);
    expect(() => assertKobo(10)).not.toThrow();
  });
});

describe("addKobo and subKobo", () => {
  it("adds exactly", () => {
    expect(addKobo(100, 250)).toBe(350);
  });

  it("refuses a sum that is not a safe integer", () => {
    expect(() => addKobo(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });

  it("refuses floats and negatives as inputs", () => {
    expect(() => addKobo(0.1, 0.2)).toThrow(RangeError);
    expect(() => addKobo(-1, 5)).toThrow(RangeError);
  });

  it("subtracts and refuses a negative result", () => {
    expect(subKobo(500, 200)).toBe(300);
    expect(subKobo(200, 200)).toBe(0);
    expect(() => subKobo(100, 101)).toThrow(RangeError);
  });
});

describe("signedKobo and balanceOf", () => {
  it("credits add and debits subtract", () => {
    expect(signedKobo("credit", 500)).toBe(500);
    expect(signedKobo("debit", 500)).toBe(-500);
  });

  it("sums entries in any order to the same balance", () => {
    const entries = [
      { direction: "credit" as const, amountKobo: 10_000 },
      { direction: "debit" as const, amountKobo: 2_500 },
      { direction: "credit" as const, amountKobo: 700 },
      { direction: "debit" as const, amountKobo: 200 },
    ];
    expect(balanceOf(entries)).toBe(8_000);
    expect(balanceOf([...entries].reverse())).toBe(8_000);
  });

  it("an empty ledger is zero", () => {
    expect(balanceOf([])).toBe(0);
  });

  it("can report a negative balance so callers can detect it", () => {
    expect(balanceOf([{ direction: "debit", amountKobo: 1 }])).toBe(-1);
  });

  it("is exact where float math would not be", () => {
    // 0.1 + 0.2 style drift cannot happen: every value is an integer.
    const entries = Array.from({ length: 1000 }, () => ({ direction: "credit" as const, amountKobo: 10 }));
    expect(balanceOf(entries)).toBe(10_000);
  });
});

describe("nairaToKobo", () => {
  it.each([
    ["1500", 150_000],
    ["1500.5", 150_050],
    ["1500.50", 150_050],
    ["1,500", 150_000],
    ["1,500.05", 150_005],
    ["0.01", 1],
    ["0", 0],
    ["  250  ", 25_000],
    ["1,000,000", 100_000_000],
    ["0001500", 150_000],
  ])("parses %s", (input, expected) => {
    expect(nairaToKobo(input)).toBe(expected);
  });

  it.each(["", " ", "abc", "-5", "+5", "1e3", "1.234", "1,50", "15,00", ".5", "5.", "1 000", "₦100", "NaN", "Infinity", "1,500,", "1..5", "999999999999999"])(
    "rejects %j",
    (input) => {
      expect(nairaToKobo(input)).toBeNull();
    },
  );

  it("caps the whole naira part at 12 digits even when the result would still be a safe integer", () => {
    expect(nairaToKobo("999999999999")).toBe(99_999_999_999_900);
    expect(nairaToKobo("1000000000000")).toBeNull();
    expect(nairaToKobo("1,000,000,000,000")).toBeNull();
  });

  it("never produces a non integer", () => {
    for (const input of ["0.07", "19.99", "1234567.89", "0.10"]) {
      const kobo = nairaToKobo(input);
      expect(Number.isInteger(kobo)).toBe(true);
    }
    expect(nairaToKobo("19.99")).toBe(1_999);
    expect(nairaToKobo("1234567.89")).toBe(123_456_789);
  });
});

describe("formatNairaPlain", () => {
  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [99, "0.99"],
    [100, "1.00"],
    [150_050, "1,500.50"],
    [100_000_000, "1,000,000.00"],
    [123_456_789, "1,234,567.89"],
  ])("formats %i as %s", (kobo, expected) => {
    expect(formatNairaPlain(kobo)).toBe(expected);
  });

  it("round trips with nairaToKobo for a spread of values", () => {
    for (let kobo = 0; kobo < 1_000_000; kobo += 7_919) {
      expect(nairaToKobo(formatNairaPlain(kobo))).toBe(kobo);
    }
  });

  it("refuses a float", () => {
    expect(() => formatNairaPlain(10.5)).toThrow(RangeError);
  });
});
