import { daysBetween, isIsoDate } from "@/lib/member/dates";

/** "2026-11-21" -> "Sat 21 Nov". Invalid dates are shown as unavailable, never guessed. */
export function formatDay(iso: string): string {
  if (!isIsoDate(iso)) return "Date unavailable";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Due today", "Due tomorrow", "Due in 5 days", "3 days overdue". `daysUntil` comes from the member home view. */
export function describeDays(daysUntil: number): string {
  if (daysUntil === 0) return "Due today";
  if (daysUntil === 1) return "Due tomorrow";
  if (daysUntil > 1) return `Due in ${daysUntil} days`;
  return daysUntil === -1 ? "1 day overdue" : `${Math.abs(daysUntil)} days overdue`;
}

export { daysBetween };
