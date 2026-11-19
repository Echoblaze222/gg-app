import { initiatePaymentInputSchema } from "../../contracts/schemas";
import type { PaymentChannel, PaymentPurpose } from "../../contracts/enums";
import type { InitiatePaymentInput } from "../../contracts/services";

/** What the member intends to pay. Two payments with the same intent share one idempotency key. */
export interface PaymentIntent {
  readonly purpose: PaymentPurpose;
  readonly amountKobo: number;
  readonly obligationId?: string;
  readonly paymentMethodId?: string;
  readonly channel?: PaymentChannel;
}

/**
 * Stable identity of an intent. Every field that changes what is charged is part of it, so changing the
 * amount, obligation, method or channel always gives a different key and can never hit IDEMPOTENCY_KEY_REUSED.
 */
export function intentFingerprint(intent: PaymentIntent): string {
  return JSON.stringify([intent.purpose, intent.amountKobo, intent.obligationId ?? null, intent.paymentMethodId ?? null, intent.channel ?? null]);
}

export type BuildInitiateResult =
  | { readonly ok: true; readonly input: InitiatePaymentInput }
  | { readonly ok: false; readonly fields: Record<string, string> };

/** Early feedback only. The server validates again and owns the business limits. */
export function buildInitiateInput(intent: PaymentIntent, idempotencyKey: string): BuildInitiateResult {
  const parsed = initiatePaymentInputSchema.safeParse({ ...intent, idempotencyKey });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "_";
      if (!(key in fields)) {
        fields[key] = issue.message;
      }
    }
    return { ok: false, fields };
  }
  const data = parsed.data;
  const input: InitiatePaymentInput = {
    purpose: data.purpose,
    amountKobo: data.amountKobo,
    idempotencyKey: data.idempotencyKey,
    ...(data.obligationId !== undefined ? { obligationId: data.obligationId } : {}),
    ...(data.paymentMethodId !== undefined ? { paymentMethodId: data.paymentMethodId } : {}),
    ...(data.channel !== undefined ? { channel: data.channel } : {}),
  };
  return { ok: true, input };
}
