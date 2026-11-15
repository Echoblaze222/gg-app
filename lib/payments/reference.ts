import type { Uuid } from "@/contracts/entities";
import { idempotencyKeySchema, uuidSchema } from "@/contracts/schemas";
import { lagosDate } from "@/lib/contributions/schedule";
import { defaultRandomBytes, randomBase32, type RandomBytes } from "./random";

/**
 * Provider reference: "gg-" plus 20 random base32 characters (100 bits).
 * Paystack accepts letters, digits, "-", "." and "=" only, so this is valid and unguessable.
 */
export const REFERENCE_PATTERN = /^gg-[0-9A-HJKMNP-TV-Z]{20}$/;

export function generateReference(randomBytes: RandomBytes = defaultRandomBytes): string {
  return `gg-${randomBase32(20, randomBytes)}`;
}

export function isValidReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value);
}

/** Receipt number: "GG-", the Lagos date as YYMMDD, then 8 random base32 characters. */
export const RECEIPT_NUMBER_PATTERN = /^GG-\d{6}-[0-9A-HJKMNP-TV-Z]{8}$/;

export function generateReceiptNumber(now: Date, randomBytes: RandomBytes = defaultRandomBytes): string {
  const yymmdd = lagosDate(now).slice(2).replace(/-/g, "");
  return `GG-${yymmdd}-${randomBase32(8, randomBytes)}`;
}

export function isValidReceiptNumber(value: string): boolean {
  return RECEIPT_NUMBER_PATTERN.test(value);
}

/** Highest attempt number the key format allows. Charge retry policy stays far below it. */
export const MAX_CHARGE_ATTEMPT_NO = 99;

/**
 * Idempotency key for a system initiated scheduled charge: "chg-<obligationId>-<attemptNo>".
 * The same obligation and attempt number always give the same key, so a crashed and restarted
 * runner reuses the same attempt and the same provider reference instead of charging twice (A4).
 */
export function chargeIdempotencyKey(obligationId: Uuid, attemptNo: number): string {
  if (!uuidSchema.safeParse(obligationId).success) throw new RangeError("obligationId must be a UUID");
  if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_CHARGE_ATTEMPT_NO) {
    throw new RangeError(`attemptNo must be an integer from 1 to ${MAX_CHARGE_ATTEMPT_NO}`);
  }
  const key = `chg-${obligationId}-${attemptNo}`;
  const parsed = idempotencyKeySchema.safeParse(key);
  if (!parsed.success) throw new RangeError("charge idempotency key does not satisfy the contract schema");
  return key;
}
