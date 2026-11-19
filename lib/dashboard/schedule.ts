import type { ContributionObligation } from "@/contracts/entities";
import { daysBetween, isIsoDate } from "@/lib/member/dates";
import { formatNaira } from "@/lib/member/money";

export type PillStatus = "paid" | "due" | "overdue" | "upcoming" | "missed";

export interface SchedulePill {
  id: string;
  dueOn: string;
  /** Already formatted. A row with a corrupt amount or date is left out instead of shown wrong. */
  amount: string;
  status: PillStatus;
}

export const SCHEDULE_FETCH = 12;
export const SCHEDULE_SHOWN = 6;

export function pillStatus(o: Pick<ContributionObligation, "status" | "dueOn">, today: string): PillStatus | null {
  if (!isIsoDate(o.dueOn) || !isIsoDate(today)) return null;
  switch (o.status) {
    case "paid":
      return "paid";
    case "missed":
      return "missed";
    case "scheduled":
      return "upcoming";
    case "due":
      return daysBetween(today, o.dueOn) < 0 ? "overdue" : "due";
    default:
      return null; // cancelled obligations are not part of the schedule
  }
}

/**
 * The schedule window: sorted by due date, starting two entries before the first one that is not in the past,
 * at most SCHEDULE_SHOWN long, so the member sees what was just paid and what is coming.
 */
export function buildSchedule(obligations: readonly ContributionObligation[], today: string): SchedulePill[] {
  const pills: SchedulePill[] = [];
  for (const o of [...obligations].sort((a, b) => a.dueOn.localeCompare(b.dueOn))) {
    const status = pillStatus(o, today);
    if (!status) continue;
    try {
      pills.push({ id: o.id, dueOn: o.dueOn, amount: formatNaira(o.amountKobo), status });
    } catch {
      // corrupt amount: skip the row
    }
  }
  const firstCurrent = pills.findIndex((p) => p.dueOn >= today || p.status === "overdue");
  const anchor = firstCurrent === -1 ? Math.max(0, pills.length - 2) : firstCurrent;
  const start = Math.max(0, anchor - 2);
  return pills.slice(start, start + SCHEDULE_SHOWN);
}

/** Share of shown schedule entries that are paid. Null when there is nothing to measure. Formula: paid / shown. */
export function paidShare(pills: readonly SchedulePill[]): { paid: number; total: number; ratio: number } | null {
  if (pills.length === 0) return null;
  const paid = pills.filter((p) => p.status === "paid").length;
  return { paid, total: pills.length, ratio: paid / pills.length };
}
