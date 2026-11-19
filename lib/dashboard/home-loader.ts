import type { RequestContext, ContributionService, NotificationService, PaymentService } from "@/contracts/services";
import { buildHomeView } from "@/lib/member/home";
import type { HomeView, Section } from "@/lib/member/home";
import { safe } from "./safe";
import { buildSchedule, SCHEDULE_FETCH } from "./schedule";
import type { SchedulePill } from "./schedule";

export type MemberHomeServices = {
  contributions: ContributionService;
  payments: PaymentService;
  notifications: NotificationService;
};

/** Recent attempts to look at so in progress payments are not missed. AI-5 requires at least 10. */
export const RECENT_ATTEMPTS = 10;

export interface MemberHomeData {
  /** Built by AI-5's lib/member/home.ts, which owns every rule about what a number or status means. */
  view: HomeView;
  schedule: Section<SchedulePill[]>;
}

/** Loads every input in parallel. A failed call becomes that card's error and the others still render. */
export async function loadMemberHome(s: MemberHomeServices, ctx: RequestContext, today: string): Promise<MemberHomeData> {
  const id = ctx.requestId;
  const [balance, nextDue, plans, recentAttempts, unreadCount, obligations] = await Promise.all([
    safe(id, () => s.contributions.getBalance(ctx)),
    safe(id, () => s.contributions.getNextDue(ctx)),
    safe(id, () => s.contributions.listPlans(ctx)),
    safe(id, () => s.payments.listHistory(ctx, { limit: RECENT_ATTEMPTS })),
    safe(id, () => s.notifications.unreadCount(ctx)),
    safe(id, () => s.contributions.listObligations(ctx, { limit: SCHEDULE_FETCH })),
  ]);
  const view = buildHomeView({ today, balance, nextDue, plans, recentAttempts, unreadCount });
  const schedule: Section<SchedulePill[]> = obligations.ok ? { status: "ready", data: buildSchedule(obligations.value.items, today) } : { status: "error", error: obligations.error };
  return { view, schedule };
}
