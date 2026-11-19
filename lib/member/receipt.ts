import type { ReceiptData } from "../../contracts/services";
import type { IsoDate } from "../../contracts/entities";
import { lagosDateOf, lagosTimeOf } from "./dates";
import { CHANNEL_LABEL } from "./history";
import { formatNaira } from "./money";

export interface ReceiptView {
  readonly receiptNumber: string;
  readonly memberName: string;
  readonly amount: string;
  readonly balanceAfter: string;
  readonly paidOn: IsoDate;
  /** Lagos time, HH:MM. */
  readonly paidAtTime: string;
  readonly channelLabel: string | null;
  readonly providerReference: string;
}

/**
 * Returns null when the receipt data is not safe to show (bad amount, bad date), so the screen can show an
 * honest error state instead of a receipt with a wrong number on it.
 */
export function receiptView(data: ReceiptData): ReceiptView | null {
  try {
    if (data.amountKobo <= 0) {
      return null;
    }
    return {
      receiptNumber: data.receiptNumber,
      memberName: data.memberName,
      amount: formatNaira(data.amountKobo),
      balanceAfter: formatNaira(data.balanceAfterKobo),
      paidOn: lagosDateOf(data.paidAt),
      paidAtTime: lagosTimeOf(data.paidAt),
      channelLabel: data.channel === null ? null : CHANNEL_LABEL[data.channel],
      providerReference: data.providerReference,
    };
  } catch {
    return null;
  }
}
