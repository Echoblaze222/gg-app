import { describe, expect, it } from "vitest";
import { daysBetween, isIsoDate, lagosDateOf, lagosTimeOf, lagosToday } from "./dates";
import { formatLedgerAmount, formatNaira } from "./money";

describe("formatNaira", () => {
  it.each([
    [0, "\u20A60.00"],
    [5, "\u20A60.05"],
    [100, "\u20A61.00"],
    [150050, "\u20A61,500.50"],
    [123456789, "\u20A61,234,567.89"],
    [100_000_000 * 100, "\u20A6100,000,000.00"],
  ])("formats %i kobo as %s", (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected);
  });

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.MAX_SAFE_INTEGER + 1]])("refuses %s", (value) => {
    expect(() => formatNaira(value)).toThrow(RangeError);
  });

  it("signs ledger amounts by direction", () => {
    expect(formatLedgerAmount(2500, "credit")).toBe("+\u20A625.00");
    expect(formatLedgerAmount(2500, "debit")).toBe("-\u20A625.00");
  });
});

describe("Lagos calendar", () => {
  it("rolls to the next Lagos day at 23:00 UTC", () => {
    expect(lagosToday(new Date("2026-11-14T22:59:59Z"))).toBe("2026-11-14");
    expect(lagosToday(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
  });

  it("rolls over month and year ends", () => {
    expect(lagosDateOf("2026-12-31T23:30:00Z")).toBe("2027-01-01");
    expect(lagosDateOf("2026-02-28T23:30:00Z")).toBe("2026-03-01");
  });

  it("gives the Lagos wall clock time", () => {
    expect(lagosTimeOf("2026-11-14T08:05:00Z")).toBe("09:05");
    expect(lagosTimeOf("2026-11-14T23:30:00Z")).toBe("00:30");
  });

  it("rejects an invalid timestamp", () => {
    expect(() => lagosDateOf("not a date")).toThrow(RangeError);
  });
});

describe("isIsoDate and daysBetween", () => {
  it.each([["2026-02-30"], ["2026-13-01"], ["2026-00-10"], ["26-01-01"], ["2026-1-1"], ["1999-12-31"], ["2101-01-01"], [""]])("rejects %s", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });

  it("accepts real dates including a leap day", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });

  it("counts whole days, negative when the target is earlier", () => {
    expect(daysBetween("2026-11-14", "2026-11-17")).toBe(3);
    expect(daysBetween("2026-11-17", "2026-11-14")).toBe(-3);
    expect(daysBetween("2026-11-14", "2026-11-14")).toBe(0);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("throws on an invalid date instead of returning a wrong number", () => {
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(RangeError);
  });
});
