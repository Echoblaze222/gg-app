import { describe, expect, it } from "vitest";
import { describeDays, formatDay } from "./display";

describe("formatDay", () => {
  it("formats a business date without shifting the day", () => {
    expect(formatDay("2026-11-21")).toBe("Sat 21 Nov");
    expect(formatDay("2026-01-01")).toBe("Thu 1 Jan");
  });
  it("never guesses an invalid date", () => {
    expect(formatDay("2026-02-31")).toBe("Date unavailable");
    expect(formatDay("garbage")).toBe("Date unavailable");
  });
});

describe("describeDays", () => {
  it("covers today, tomorrow, later and overdue", () => {
    expect(describeDays(0)).toBe("Due today");
    expect(describeDays(1)).toBe("Due tomorrow");
    expect(describeDays(5)).toBe("Due in 5 days");
    expect(describeDays(-1)).toBe("1 day overdue");
    expect(describeDays(-3)).toBe("3 days overdue");
  });
});
