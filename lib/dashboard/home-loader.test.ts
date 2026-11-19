import { describe, expect, it } from "vitest";
import { AppError } from "@/contracts/errors";
import type { Result } from "@/contracts/errors";
import type { Balance, ContributionObligation, ContributionPlan, Page, PaymentAttempt } from "@/contracts/entities";
import type { RequestContext } from "@/contracts/services";
import { loadMemberHome } from "./home-loader";
import type { MemberHomeServices } from "./home-loader";

const ctx: RequestContext = { requestId: "req-9", actorId: null, ip: null, userAgent: null };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const err = <T,>(): Result<T> => ({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "ref-x" }).toShape() });

const obligation: ContributionObligation = { id: "ob1", planId: "p1", memberId: "m", dueOn: "2026-11-21", amountKobo: 500000, currency: "NGN", status: "due", paidByAttemptId: null, createdAt: "", updatedAt: "" };
const plan = { id: "p1", status: "active" } as ContributionPlan;
const balance: Balance = { memberId: "m", currency: "NGN", ledgerKobo: 1500000, availableKobo: 1500000, heldKobo: 0 };
const page = <T,>(items: T[]): Page<T> => ({ items, nextCursor: null });

function services(over: Partial<{ [K in keyof MemberHomeServices]: Partial<MemberHomeServices[K]> }> = {}): MemberHomeServices {
  return {
    contributions: { getBalance: async () => ok(balance), getNextDue: async () => ok(obligation), listPlans: async () => ok([plan]), listObligations: async () => ok(page([obligation])), ...over.contributions },
    payments: { listHistory: async () => ok(page<PaymentAttempt>([])), ...over.payments },
    notifications: { unreadCount: async () => ok(3), ...over.notifications },
  } as unknown as MemberHomeServices;
}

describe("loadMemberHome", () => {
  it("builds every section from the services", async () => {
    const { view, schedule } = await loadMemberHome(services(), ctx, "2026-11-19");
    expect(view.balance.status).toBe("ready");
    expect(view.nextDue.status === "ready" && view.nextDue.data.kind).toBe("due");
    expect(view.unreadBadge.status === "ready" && view.unreadBadge.data).toBe("3");
    expect(schedule.status).toBe("ready");
  });
  it("one failing call only fails its own card", async () => {
    const { view, schedule } = await loadMemberHome(services({ contributions: { getBalance: async () => err() } }), ctx, "2026-11-19");
    expect(view.balance.status).toBe("error");
    expect(view.nextDue.status).toBe("ready");
    expect(schedule.status).toBe("ready");
  });
  it("a service that throws becomes an INTERNAL error with the request reference", async () => {
    const { view } = await loadMemberHome(services({ notifications: { unreadCount: async () => { throw new Error("db down"); } } }), ctx, "2026-11-19");
    expect(view.unreadBadge.status).toBe("error");
    if (view.unreadBadge.status === "error") {
      expect(view.unreadBadge.error.code).toBe("INTERNAL");
      expect(view.unreadBadge.error.reference).toBe("req-9");
    }
  });
  it("blocks paying when recent payments could not be loaded (AI-5 rule), instead of guessing", async () => {
    const { view } = await loadMemberHome(services({ payments: { listHistory: async () => err() } }), ctx, "2026-11-19");
    expect(view.nextDue.status === "ready" && view.nextDue.data.kind === "due" && view.nextDue.data.canPay).toBe(false);
  });
});
