import type { Result } from "@/contracts/errors";
import type { ContributionService, PaymentService, RequestContext } from "@/contracts/services";
import { buildReceiptIndex, toHistoryRow } from "@/lib/member/history";
import type { HistoryRow } from "@/lib/member/history";
import { safe } from "./safe";

export const HISTORY_PAGE = 20;
/** Recent ledger credits looked at to find receipt numbers. Older payments get no receipt link (AI-5 limit, see ai5-contract-request-receipt-link.md). */
export const LEDGER_LOOKUP = 50;

export interface HistoryPageData {
  rows: HistoryRow[];
  /** Payments that could not be shown because their data was corrupt. Shown as a count, never hidden silently. */
  skipped: number;
  nextCursor: string | null;
}

/** One page of payment history, mapped by AI-5's `toHistoryRow`, which alone decides statuses, copy and receipt links. */
export async function loadHistoryPage(
  s: { payments: PaymentService; contributions: ContributionService },
  ctx: RequestContext,
  cursor: string | null,
): Promise<Result<HistoryPageData>> {
  const [attempts, ledger] = await Promise.all([
    safe(ctx.requestId, () => s.payments.listHistory(ctx, { limit: HISTORY_PAGE, cursor })),
    safe(ctx.requestId, () => s.contributions.listLedger(ctx, { limit: LEDGER_LOOKUP })),
  ]);
  if (!attempts.ok) return attempts;
  // If the ledger lookup fails the history still shows, only without receipt links.
  const receipts = ledger.ok ? buildReceiptIndex(ledger.value.items) : new Map<string, string>();
  const rows: HistoryRow[] = [];
  let skipped = 0;
  for (const attempt of attempts.value.items) {
    try {
      rows.push(toHistoryRow(attempt, receipts.get(attempt.id) ?? null));
    } catch {
      skipped += 1;
    }
  }
  return { ok: true, value: { rows, skipped, nextCursor: attempts.value.nextCursor } };
}
