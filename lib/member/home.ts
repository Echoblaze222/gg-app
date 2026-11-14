import type { Balance, ContributionObligation, ContributionPlan, IsoDate, Page, PaymentAttempt } from "../../contracts/entities";
import type { AppErrorShape, Result } from "../../contracts/errors";
import { balanceView, type BalanceView } from "./balance";
import { daysBetween, isIsoDate } from "./dates";
import { formatNaira } from "./money";
import { PAYMENT_STATUS_PRESENTATION, isInFlight } from "./payment-status";

/** Each part of the home screen succeeds or fails alone, so one failing call never blanks the whole screen. */
export type Section<T> = { readonly status: "ready"; readonly data: T } | { readonly status: "error"; readonly error: AppErrorShape };

export type NextDueUrgency = "overdue" | "today" | "soon" | "later";
export type NoDueReason = "no_plan" | "plan_paused" | "nothing_due";

export type NextDueView =
  | { readonly kind: "none"; readonly reason: NoDueReason }
  /** The due date was not a valid date. Shown as unavailable instead of guessing. */
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "due";
      readonly obligationId: string;
      readonly amount: string;
      readonly dueOn: IsoDate;
      readonly daysUntil: number;
      readonly urgency: NextDueUrgency;
      /** The server marked it missed. What a missed payment means is an owner decision, so only the fact is shown. */
      readonly missed: boolean;
      readonly canPay: boolean;
      readonly payBlockedReason: string | null;
    };

export interface PendingPaymentView {
  readonly attemptId: string;
  readonly reference: string;
  readonly amount: string;
  readonly statusLabel: string;
  readonly explanation: string;
}

export interface HomeView {
  readonly balance: Section<BalanceView>;
  readonly nextDue: Section<NextDueView>;
  readonly pendingPayments: Section<readonly PendingPaymentView[]>;
  /** Null when nothing is unread. "9+" above nine. */
  readonly unreadBadge: Section<string | null>;
}

export interface HomeInputs {
  /** The Lagos calendar date, from lagosToday(). Passed in so the logic stays deterministic. */
  readonly today: IsoDate;
  readonly balance: Result<Balance>;
  readonly nextDue: Result<ContributionObligation | null>;
  readonly plans: Result<ContributionPlan[]>;
  /** Must be a recent page, at least 10 items, so in progress payments are not missed. */
  readonly recentAttempts: Result<Page<PaymentAttempt>>;
  readonly unreadCount: Result<number>;
}

function fromResult<T, U>(result: Result<T>, map: (value: T) => U): Section<U> {
  return result.ok ? { status: "ready", data: map(result.value) } : { status: "error", error: result.error };
}

export function unreadBadge(count: number): string | null {
  if (!Number.isSafeInteger(count) || count <= 0) {
    return null;
  }
  return count > 9 ? "9+" : String(count);
}

function urgencyFor(daysUntil: number): NextDueUrgency {
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil <= 3) return "soon";
  return "later";
}

function noDueReason(plans: readonly ContributionPlan[]): NoDueReason {
  if (plans.some((plan) => plan.status === "active")) return "nothing_due";
  if (plans.some((plan) => plan.status === "paused")) return "plan_paused";
  return "no_plan";
}

function buildNextDue(inputs: HomeInputs): Section<NextDueView> {
  if (!inputs.nextDue.ok) {
    return { status: "error", error: inputs.nextDue.error };
  }
  const obligation = inputs.nextDue.value;
  const payable = obligation !== null && (obligation.status === "scheduled" || obligation.status === "due" || obligation.status === "missed");

  if (!payable) {
    if (!inputs.plans.ok) {
      return { status: "error", error: inputs.plans.error };
    }
    return { status: "ready", data: { kind: "none", reason: noDueReason(inputs.plans.value) } };
  }

  if (!isIsoDate(obligation.dueOn) || !isIsoDate(inputs.today)) {
    return { status: "ready", data: { kind: "unavailable" } };
  }

  const daysUntil = daysBetween(inputs.today, obligation.dueOn);

  // Paying is allowed only when we know no payment for this obligation is already in progress.
  // If the recent payments could not be loaded we do not know, so we do not allow it.
  let canPay = true;
  let payBlockedReason: string | null = null;
  if (!inputs.recentAttempts.ok) {
    canPay = false;
    payBlockedReason = "We could not check for payments in progress. Refresh before paying.";
  } else if (inputs.recentAttempts.value.items.some((attempt) => attempt.obligationId === obligation.id && isInFlight(attempt.status))) {
    canPay = false;
    payBlockedReason = "A payment for this is already in progress. Do not pay again.";
  }

  return {
    status: "ready",
    data: {
      kind: "due",
      obligationId: obligation.id,
      amount: formatNaira(obligation.amountKobo),
      dueOn: obligation.dueOn,
      daysUntil,
      urgency: urgencyFor(daysUntil),
      missed: obligation.status === "missed",
      canPay,
      payBlockedReason,
    },
  };
}

export function buildHomeView(inputs: HomeInputs): HomeView {
  return {
    balance: fromResult(inputs.balance, balanceView),
    nextDue: buildNextDue(inputs),
    pendingPayments: fromResult(inputs.recentAttempts, (page) =>
      page.items
        .filter((attempt) => isInFlight(attempt.status))
        .map((attempt) => ({
          attemptId: attempt.id,
          reference: attempt.reference,
          amount: formatNaira(attempt.amountKobo),
          statusLabel: PAYMENT_STATUS_PRESENTATION[attempt.status].label,
          explanation: PAYMENT_STATUS_PRESENTATION[attempt.status].explanation,
        })),
    ),
    unreadBadge: fromResult(inputs.unreadCount, unreadBadge),
  };
}
