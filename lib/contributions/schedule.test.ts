import { describe, expect, it } from "vitest";
import {
  MAX_OCCURRENCES_PER_CALL,
  addDays,
  addMonthsClamped,
  civilFromDays,
  compareIsoDate,
  daysBetween,
  daysFromCivil,
  daysInMonth,
  dueDate,
  formatIsoDate,
  isLeapYear,
  lagosDate,
  occurrencesThrough,
  parseIsoDate,
  timeBasedStatus,
} from "./schedule";

describe("parseIsoDate", () => {
  it("accepts real dates", () => {
    expect(parseIsoDate("2026-11-14")).toEqual({ year: 2026, month: 11, day: 14 });
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-1-1", "26-01-01", "2026/01/01", "2026-01-01T00:00:00Z", "", "1969-12-31", "10000-01-01"])(
    "rejects %j",
    (text) => {
      expect(parseIsoDate(text)).toBeNull();
    },
  );

  it("follows the Gregorian century rules", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });
});

describe("day numbers", () => {
  it("anchors 1970-01-01 at zero", () => {
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(daysFromCivil({ year: 1970, month: 1, day: 2 })).toBe(1);
  });

  it("round trips every day from 1970 to 2100", () => {
    const start = daysFromCivil({ year: 1970, month: 1, day: 1 });
    const end = daysFromCivil({ year: 2100, month: 12, day: 31 });
    let previous: string | null = null;
    for (let n = start; n <= end; n += 1) {
      const civil = civilFromDays(n);
      expect(daysFromCivil(civil)).toBe(n);
      expect(parseIsoDate(formatIsoDate(civil))).toEqual(civil);
      const text = formatIsoDate(civil);
      if (previous !== null) expect(text > previous).toBe(true);
      previous = text;
    }
  });

  it("daysInMonth matches the calendar", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is reversible", () => {
    expect(addDays(addDays("2026-11-14", 400), -400)).toBe("2026-11-14");
  });

  it("rejects an invalid date and a fractional step", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("2026-02-01", 1.5)).toThrow(RangeError);
  });
});

describe("addMonthsClamped", () => {
  it("keeps the day when the month is long enough", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonthsClamped("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("a leap day anchor lands on Feb 28 in non leap years and Feb 29 in leap years", () => {
    expect(addMonthsClamped("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonthsClamped("2028-02-29", 48)).toBe("2032-02-29");
  });

  it("rejects a negative or fractional month count", () => {
    expect(() => addMonthsClamped("2026-01-01", -1)).toThrow(RangeError);
    expect(() => addMonthsClamped("2026-01-01", 0.5)).toThrow(RangeError);
  });
});

describe("dueDate", () => {
  it("occurrence zero is the start date for every frequency", () => {
    for (const f of ["daily", "weekly", "monthly"] as const) {
      expect(dueDate("2026-11-14", f, 0)).toBe("2026-11-14");
    }
  });

  it("daily and weekly step by fixed day counts", () => {
    expect(dueDate("2026-11-14", "daily", 17)).toBe("2026-12-01");
    expect(dueDate("2026-11-14", "weekly", 3)).toBe("2026-12-05");
  });

  it("monthly never drifts from the anchor day", () => {
    const seq = [0, 1, 2, 3, 4].map((n) => dueDate("2026-01-31", "monthly", n));
    expect(seq).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("is strictly increasing for every frequency across three years of start dates", () => {
    const first = daysFromCivil({ year: 2026, month: 1, day: 1 });
    for (let n = first; n < first + 3 * 366; n += 1) {
      const startsOn = formatIsoDate(civilFromDays(n));
      for (const frequency of ["daily", "weekly", "monthly"] as const) {
        let previous = dueDate(startsOn, frequency, 0);
        for (let i = 1; i <= 30; i += 1) {
          const current = dueDate(startsOn, frequency, i);
          expect(compareIsoDate(current, previous)).toBe(1);
          previous = current;
        }
      }
    }
  });

  it("monthly day is always the anchor day or the month end, for every start date", () => {
    const first = daysFromCivil({ year: 2027, month: 1, day: 1 });
    for (let n = first; n < first + 366; n += 1) {
      const startsOn = formatIsoDate(civilFromDays(n));
      const anchorDay = parseIsoDate(startsOn)!.day;
      for (let i = 0; i <= 36; i += 1) {
        const due = parseIsoDate(dueDate(startsOn, "monthly", i))!;
        expect(due.day).toBe(Math.min(anchorDay, daysInMonth(due.year, due.month)));
      }
    }
  });

  it("weekly keeps the weekday of the start date", () => {
    const base = daysFromCivil(parseIsoDate("2026-11-14")!);
    for (let i = 0; i < 60; i += 1) {
      const n = daysFromCivil(parseIsoDate(dueDate("2026-11-14", "weekly", i))!);
      expect((n - base) % 7).toBe(0);
    }
  });

  it("rejects a negative or fractional index", () => {
    expect(() => dueDate("2026-11-14", "daily", -1)).toThrow(RangeError);
    expect(() => dueDate("2026-11-14", "daily", 1.5)).toThrow(RangeError);
  });
});

describe("occurrencesThrough", () => {
  it("lists every due date up to and including the horizon", () => {
    expect(occurrencesThrough("2026-11-14", "weekly", "2026-12-05")).toEqual([
      { index: 0, dueOn: "2026-11-14" },
      { index: 1, dueOn: "2026-11-21" },
      { index: 2, dueOn: "2026-11-28" },
      { index: 3, dueOn: "2026-12-05" },
    ]);
  });

  it("returns an empty list when the horizon is before the start", () => {
    expect(occurrencesThrough("2026-11-14", "daily", "2026-11-13")).toEqual([]);
  });

  it("one daily occurrence when the horizon equals the start", () => {
    expect(occurrencesThrough("2026-11-14", "daily", "2026-11-14")).toHaveLength(1);
  });

  it("refuses a span beyond the safety cap", () => {
    expect(() => occurrencesThrough("2026-01-01", "daily", "2035-01-01")).toThrow(RangeError);
    expect(occurrencesThrough("2026-01-01", "daily", addDays("2026-01-01", MAX_OCCURRENCES_PER_CALL - 1))).toHaveLength(MAX_OCCURRENCES_PER_CALL);
  });

  it("rejects invalid inputs", () => {
    expect(() => occurrencesThrough("nope", "daily", "2026-11-14")).toThrow(RangeError);
    expect(() => occurrencesThrough("2026-11-14", "daily", "2026-02-30")).toThrow(RangeError);
  });
});

describe("compareIsoDate and daysBetween", () => {
  it("orders dates", () => {
    expect(compareIsoDate("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareIsoDate("2026-01-02", "2026-01-01")).toBe(1);
    expect(compareIsoDate("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("counts days", () => {
    expect(daysBetween("2026-11-14", "2026-11-14")).toBe(0);
    expect(daysBetween("2026-11-14", "2026-12-14")).toBe(30);
    expect(daysBetween("2026-12-14", "2026-11-14")).toBe(-30);
  });
});

describe("lagosDate", () => {
  it("is UTC plus one hour", () => {
    expect(lagosDate(new Date("2026-11-14T12:00:00Z"))).toBe("2026-11-14");
  });

  it("moves to the next day from 23:00 UTC", () => {
    expect(lagosDate(new Date("2026-11-14T22:59:59.999Z"))).toBe("2026-11-14");
    expect(lagosDate(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
  });

  it("crosses the new year in Lagos before UTC", () => {
    expect(lagosDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("rejects an invalid instant", () => {
    expect(() => lagosDate(new Date("not a date"))).toThrow(RangeError);
  });
});

describe("timeBasedStatus", () => {
  const dueOn = "2026-11-14";

  it("is scheduled before the due date", () => {
    expect(timeBasedStatus({ today: "2026-11-13", dueOn, graceDays: 2 })).toBe("scheduled");
  });

  it("is due on the due date and through the grace period", () => {
    expect(timeBasedStatus({ today: "2026-11-14", dueOn, graceDays: 2 })).toBe("due");
    expect(timeBasedStatus({ today: "2026-11-16", dueOn, graceDays: 2 })).toBe("due");
  });

  it("is missed the day after the grace period ends", () => {
    expect(timeBasedStatus({ today: "2026-11-17", dueOn, graceDays: 2 })).toBe("missed");
  });

  it("zero grace days means missed the day after the due date", () => {
    expect(timeBasedStatus({ today: "2026-11-14", dueOn, graceDays: 0 })).toBe("due");
    expect(timeBasedStatus({ today: "2026-11-15", dueOn, graceDays: 0 })).toBe("missed");
  });

  it("rejects a negative or fractional grace period", () => {
    expect(() => timeBasedStatus({ today: dueOn, dueOn, graceDays: -1 })).toThrow(RangeError);
    expect(() => timeBasedStatus({ today: dueOn, dueOn, graceDays: 1.5 })).toThrow(RangeError);
  });
});
