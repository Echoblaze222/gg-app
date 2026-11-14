import type { IsoDate, LedgerEntry, PaymentAttempt } from "../../contracts/entities";
import type { PaymentChannel, PaymentPurpose } from "../../contracts/enums";
import { lagosDateOf } from "./dates";
import { formatNaira } from "./money";
import { PAYMENT_STATUS_PRESENTATION, failureCopy, type StatusTone } from "./payment-status";

export const PURPOSE_LABEL: Record<PaymentPurpose, string> = {
  scheduled_contribution: "Scheduled contribution",
  one_time_contribution: "One-time contribution",
  card_authorization: "Card verification",
};

export const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
  manual_transfer: "Manual transfer",
};

export interface HistoryRow {
  readonly id: string;
  readonly reference: string;
  readonly amount: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly explanation: string;
  readonly failure: { message: string; action: string } | null;
  readonly purposeLabel: string;
  readonly channelLabel: string | null;
  readonly dateLagos: IsoDate;
  readonly receiptNumber: string | null;
  /** Set only for a successful payment that has a receipt. */
  readonly href: string | null;
}

/**
 * Maps a payment attempt to a display row. A receipt link exists only when the server says the payment
 * was successful AND a receipt number is known. Nothing else can produce a link.
 */
export function toHistoryRow(attempt: PaymentAttempt, receiptNumber: string | null): HistoryRow {
  const presentation = PAYMENT_STATUS_PRESENTATION[attempt.status];
  const linkable = attempt.status === "successful" && receiptNumber !== null && receiptNumber.length > 0;
  return {
    id: attempt.id,
    reference: attempt.reference,
    amount: formatNaira(attempt.amountKobo),
    statusLabel: presentation.label,
    tone: presentation.tone,
    explanation: presentation.explanation,
    failure: attempt.status === "failed" ? failureCopy(attempt.failureCode) : null,
    purposeLabel: PURPOSE_LABEL[attempt.purpose],
    channelLabel: attempt.channel === null ? null : CHANNEL_LABEL[attempt.channel],
    dateLagos: lagosDateOf(attempt.createdAt),
    receiptNumber: linkable ? receiptNumber : null,
    href: linkable ? `/app/history/${encodeURIComponent(receiptNumber)}` : null,
  };
}

/**
 * Best effort map from payment attempt id to receipt number, built from ledger credits.
 * LIMIT: it only knows the ledger entries that were loaded. A successful attempt whose credit is on another
 * page gets no link. The real fix is a contract change, see docs/handoffs/ai5-contract-request-receipt-link.md.
 */
export function buildReceiptIndex(ledger: readonly LedgerEntry[]): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const entry of ledger) {
    if (entry.entryType === "contribution_credit" && entry.paymentAttemptId !== null && entry.receiptNumber !== null) {
      index.set(entry.paymentAttemptId, entry.receiptNumber);
    }
  }
  return index;
}
