import { describe, expect, it } from "vitest";
import type { ContributionObligation } from "@/contracts/entities";
import { buildSchedule, paidShare, pillStatus, SCHEDULE_SHOWN } from "./schedule";

const base = { planId: "p", memberId: "m", currency: "NGN", paidByAttemptId: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" } as const;
const ob = (id: string, dueOn: string, status: ContributionObligation["status"], amountKobo = 500000): ContributionObligation => ({ ...base, id, dueOn, status, amountKobo });

describe("pillStatus", () => {
  it("maps every obligation status and marks past due as overdue", () => {
    expect(pillStatus(ob("a", "2026-11-10", "paid"), "2026-11-19")).toBe("paid");
    expect(pillStatus(ob("a", "2026-11-10", "missed"), "2026-11-19")).toBe("missed");
    expect(pillStatus(ob("a", "2026-11-25", "scheduled"), "2026-11-19")).toBe("upcoming");
    expect(pillStatus(ob("a", "2026-11-19", "due"), "2026-11-19")).toBe("due");
    expect(pillStatus(ob("a", "2026-11-15", "due"), "2026-11-19")).toBe("overdue");
  });
  it("leaves out cancelled obligations and invalid dates", () => {
    expect(pillStatus(ob("a", "2026-11-25", "cancelled"), "2026-11-19")).toBeNull();
    expect(pillStatus(ob("a", "not-a-date", "due"), "2026-11-19")).toBeNull();
  });
});

describe("buildSchedule", () => {
  it("sorts by due date and shows two earlier entries before the current one", () => {
    const rows = [ob("e", "2026-12-17", "scheduled"), ob("a", "2026-11-05", "paid"), ob("b", "2026-11-12", "paid"), ob("c", "2026-11-19", "due"), ob("d", "2026-12-10", "scheduled"), ob("old", "2026-10-29", "paid")];
    const pills = buildSchedule(rows, "2026-11-19");
    expect(pills.map((p) => p.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(pills[2].status).toBe("due");
  });
  it("never shows more than the cap", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ob(`o${i}`, `2026-12-${String(i + 1).padStart(2, "0")}`, "scheduled"));
    expect(buildSchedule(rows, "2026-11-19")).toHaveLength(SCHEDULE_SHOWN);
  });
  it("skips a corrupt amount instead of showing a wrong one", () => {
    const pills = buildSchedule([ob("bad", "2026-11-20", "scheduled", -5), ob("ok", "2026-11-21", "scheduled")], "2026-11-19");
    expect(pills.map((p) => p.id)).toEqual(["ok"]);
  });
  it("formats amounts with the member money rules", () => {
    expect(buildSchedule([ob("a", "2026-11-20", "scheduled", 500000)], "2026-11-19")[0].amount).toBe("\\u20A65,000.00");
  });
  it("returns an empty list for no obligations", () => {
    expect(buildSchedule([], "2026-11-19")).toEqual([]);
  });
});

describe("paidShare", () => {
  it("is paid divided by shown, and null when nothing is shown", () => {
    expect(paidShare([])).toBeNull();
    const pills = buildSchedule([ob("a", "2026-11-05", "paid"), ob("b", "2026-11-19", "due"), ob("c", "2026-11-26", "scheduled"), ob("d", "2026-12-03", "scheduled")], "2026-11-19");
    expect(paidShare(pills)).toEqual({ paid: 1, total: 4, ratio: 0.25 });
  });
});
