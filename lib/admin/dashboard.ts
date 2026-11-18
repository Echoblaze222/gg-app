import { AppError, type Result } from "../../contracts/errors";
import {
  OPEN_PAYOUT_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYOUT_STATUSES,
  SUPPORT_TICKET_STATUSES,
  type PaymentAttemptStatus,
  type PayoutStatus,
  type SupportTicketStatus,
} from "../../contracts/enums";
import type { PermissionName } from "../../contracts/permissions";
import type { AuthorizationService, RequestContext } from "../../contracts/services";
import type { AdminCountsRepository } from "../../contracts/v1_1";
import { fail, failFrom, ok } from "../notifications/result";

/**
 * Admin dashboard summary. This is an AI-5 internal service, not part of the frozen contract: the admin screens
 * call it, nothing outside AI-5 does. It only turns aggregate counts into what a staff member needs to see first.
 */

export type DashboardSectionName = "payouts" | "payments" | "reconciliation" | "support";

/** A section is either ready, or unavailable. The screen shows a retry state for unavailable, never a zero. */
export type DashboardSection<T> = { readonly state: "ready"; readonly data: T } | { readonly state: "unavailable" };

export interface PayoutsSummary {
  readonly byStatus: Record<PayoutStatus, number>;
  /** Payouts that passed the member's one time code and wait for an admin decision. */
  readonly awaitingApproval: number;
  /** Approved or already with the provider. */
  readonly inProgress: number;
  /** Every payout that still holds the member's money. */
  readonly open: number;
}

export interface PaymentsSummary {
  readonly stuckAfterSeconds: number;
  /** Attempts that stopped on our side (initiating, processing, verifying) for longer than the threshold. */
  readonly stuck: number;
  readonly stuckByStatus: Record<PaymentAttemptStatus, number>;
}

export interface ReconciliationSummary {
  readonly open: number;
}

export interface SupportSummary {
  readonly byStatus: Record<SupportTicketStatus, number>;
  /** Tickets where the next move belongs to staff: open and pending_staff. */
  readonly needsStaff: number;
  readonly waitingOnMember: number;
}

export interface AdminDashboard {
  readonly generatedAt: string;
  /** A section is left out when the signed in staff member lacks its read permission. */
  readonly payouts?: DashboardSection<PayoutsSummary>;
  readonly payments?: DashboardSection<PaymentsSummary>;
  readonly reconciliation?: DashboardSection<ReconciliationSummary>;
  readonly support?: DashboardSection<SupportSummary>;
  /** Things that need a person now, summed over the visible sections. Null when any visible section is unavailable, because the sum would be too low. */
  readonly attentionTotal: number | null;
}

export interface AdminDashboardService {
  getSummary(ctx: RequestContext): Promise<Result<AdminDashboard>>;
}

export interface AdminDashboardServiceDeps {
  readonly authorization: AuthorizationService;
  /** Optional on purpose. Without it every visible section is unavailable. See docs/handoffs/ai5-contract-request-admin-dashboard.md (D-2). */
  readonly counts?: AdminCountsRepository;
  readonly now?: () => Date;
  /** Default 900 (15 minutes). */
  readonly stuckAfterSeconds?: number;
  /** Longest wait for one section before it shows as unavailable. Default 5000. */
  readonly sectionTimeoutMs?: number;
  readonly onSectionError?: (section: DashboardSectionName, error: unknown, reference: string) => void;
  readonly onUnexpectedError?: (error: unknown, reference: string) => void;
}

const SECTION_NAMES: readonly DashboardSectionName[] = ["payouts", "payments", "reconciliation", "support"];

const SECTION_PERMISSIONS: Record<DashboardSectionName, PermissionName> = {
  payouts: "admin.payouts.read",
  payments: "admin.payments.read",
  reconciliation: "admin.reconciliation.read",
  support: "admin.support.read",
};

/**
 * Stuck means we should have finished it: initiating, processing, verifying. awaiting_authentication is the member
 * sitting on the provider page, which is their move, so it is not counted.
 */
const STUCK_ATTEMPT_STATUSES = ["initiating", "processing", "verifying"] as const satisfies readonly PaymentAttemptStatus[];

const DEFAULT_STUCK_AFTER_SECONDS = 900;
const DEFAULT_SECTION_TIMEOUT_MS = 5000;
const UNAVAILABLE = { state: "unavailable" } as const;

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Turns whatever the repository returned into a complete status to count record, or null when it cannot be trusted.
 * A missing status counts as zero. A value that is not a non negative whole number makes the whole section unavailable,
 * because showing a wrong count on a money screen is worse than showing none.
 */
function normalizeCounts<S extends string>(statuses: readonly S[], raw: unknown): Record<S, number> | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const result = {} as Record<S, number>;
  for (const status of statuses) {
    const value = source[status] ?? 0;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return null;
    }
    result[status] = value;
  }
  return result;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Dashboard section timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sum<S extends string>(counts: Record<S, number>, statuses: readonly S[]): number {
  let total = 0;
  for (const status of statuses) {
    total += counts[status];
  }
  return total;
}

async function loadPayouts(counts: AdminCountsRepository): Promise<PayoutsSummary | null> {
  const byStatus = normalizeCounts(PAYOUT_STATUSES, await counts.countPayoutsByStatus());
  if (byStatus === null) {
    return null;
  }
  return {
    byStatus,
    awaitingApproval: byStatus.verified,
    inProgress: byStatus.approved + byStatus.processing,
    open: sum(byStatus, OPEN_PAYOUT_STATUSES),
  };
}

async function loadReconciliation(counts: AdminCountsRepository): Promise<ReconciliationSummary | null> {
  const open = await counts.countOpenReconciliationRecords();
  if (typeof open !== "number" || !Number.isSafeInteger(open) || open < 0) {
    return null;
  }
  return { open };
}

async function loadSupport(counts: AdminCountsRepository): Promise<SupportSummary | null> {
  const byStatus = normalizeCounts(SUPPORT_TICKET_STATUSES, await counts.countTicketsByStatus());
  if (byStatus === null) {
    return null;
  }
  return { byStatus, needsStaff: byStatus.open + byStatus.pending_staff, waitingOnMember: byStatus.pending_member };
}

export function createAdminDashboardService(deps: AdminDashboardServiceDeps): AdminDashboardService {
  const now = deps.now ?? (() => new Date());
  const stuckAfterSeconds = positiveInteger(deps.stuckAfterSeconds, DEFAULT_STUCK_AFTER_SECONDS);
  const sectionTimeoutMs = positiveInteger(deps.sectionTimeoutMs, DEFAULT_SECTION_TIMEOUT_MS);

  async function loadPayments(counts: AdminCountsRepository): Promise<PaymentsSummary | null> {
    const stuckByStatus = normalizeCounts(PAYMENT_ATTEMPT_STATUSES, await counts.countAttemptsByStatus({ olderThanSeconds: stuckAfterSeconds }));
    if (stuckByStatus === null) {
      return null;
    }
    return { stuckAfterSeconds, stuck: sum(stuckByStatus, STUCK_ATTEMPT_STATUSES), stuckByStatus };
  }

  /** One failing or slow section never takes the others down with it. */
  async function runSection<T>(
    ctx: RequestContext,
    name: DashboardSectionName,
    load: (() => Promise<T | null>) | null,
  ): Promise<DashboardSection<T>> {
    if (load === null) {
      return UNAVAILABLE;
    }
    try {
      const data = await withTimeout(load(), sectionTimeoutMs);
      if (data === null) {
        deps.onSectionError?.(name, new Error("Counts repository returned numbers that cannot be trusted."), ctx.requestId);
        return UNAVAILABLE;
      }
      return { state: "ready", data };
    } catch (error) {
      deps.onSectionError?.(name, error, ctx.requestId);
      return UNAVAILABLE;
    }
  }

  return {
    async getSummary(ctx) {
      try {
        const checks = await Promise.all(
          SECTION_NAMES.map(async (name) => ({ name, result: await deps.authorization.requirePermission(ctx, SECTION_PERMISSIONS[name]) })),
        );
        const allowed = new Set<DashboardSectionName>();
        for (const { name, result } of checks) {
          if (result.ok) {
            allowed.add(name);
          } else if (result.error.code !== "PERMISSION_DENIED") {
            // An expired session, missing MFA and similar must reach the screen. They are not "no access".
            return result;
          }
        }
        if (allowed.size === 0) {
          return fail("PERMISSION_DENIED", ctx.requestId);
        }

        const counts = deps.counts;
        if (!counts) {
          deps.onUnexpectedError?.(new Error("Admin counts repository is not wired."), ctx.requestId);
        }
        const loader = <T>(fn: (c: AdminCountsRepository) => Promise<T | null>): (() => Promise<T | null>) | null => (counts ? () => fn(counts) : null);

        const [payouts, payments, reconciliation, support] = await Promise.all([
          allowed.has("payouts") ? runSection(ctx, "payouts", loader(loadPayouts)) : Promise.resolve(null),
          allowed.has("payments") ? runSection(ctx, "payments", loader(loadPayments)) : Promise.resolve(null),
          allowed.has("reconciliation") ? runSection(ctx, "reconciliation", loader(loadReconciliation)) : Promise.resolve(null),
          allowed.has("support") ? runSection(ctx, "support", loader(loadSupport)) : Promise.resolve(null),
        ]);

        let attention = 0;
        let complete = true;
        const dashboard: {
          generatedAt: string;
          attentionTotal: number | null;
          payouts?: DashboardSection<PayoutsSummary>;
          payments?: DashboardSection<PaymentsSummary>;
          reconciliation?: DashboardSection<ReconciliationSummary>;
          support?: DashboardSection<SupportSummary>;
        } = { generatedAt: now().toISOString(), attentionTotal: null };

        if (payouts !== null) {
          dashboard.payouts = payouts;
          if (payouts.state === "ready") {
            attention += payouts.data.awaitingApproval;
          } else {
            complete = false;
          }
        }
        if (payments !== null) {
          dashboard.payments = payments;
          if (payments.state === "ready") {
            attention += payments.data.stuck;
          } else {
            complete = false;
          }
        }
        if (reconciliation !== null) {
          dashboard.reconciliation = reconciliation;
          if (reconciliation.state === "ready") {
            attention += reconciliation.data.open;
          } else {
            complete = false;
          }
        }
        if (support !== null) {
          dashboard.support = support;
          if (support.state === "ready") {
            attention += support.data.needsStaff;
          } else {
            complete = false;
          }
        }
        dashboard.attentionTotal = complete ? attention : null;
        return ok(dashboard);
      } catch (error) {
        if (!(error instanceof AppError)) {
          deps.onUnexpectedError?.(error, ctx.requestId);
        }
        return failFrom(error, ctx.requestId);
      }
    },
  };
}
