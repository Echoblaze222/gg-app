/**
 * Zod schemas for the Paystack responses we read. Based on the official API reference samples.
 * Unknown fields are ignored. Fields we depend on are required, so a changed shape fails closed
 * as "malformed" instead of being read wrongly.
 */
import { z } from "zod";

// Error bodies such as {"status": false, "message": "..."} carry no `data` key, and Zod 4 treats a
// missing `unknown` key as invalid unless it is optional.
const envelope = z.object({ status: z.boolean(), message: z.string().nullish(), data: z.unknown().optional() });

/** Transaction ids are unsigned 64 bit: a number for small ids, a string for very large ones. */
const providerId = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform((v) => String(v));

const kobo = z.number().int().nonnegative();

const authorization = z.object({
  authorization_code: z.string().min(1),
  signature: z.string().min(1),
  last4: z.string().nullish(),
  exp_month: z.string().nullish(),
  exp_year: z.string().nullish(),
  brand: z.string().nullish(),
  card_type: z.string().nullish(),
  bank: z.string().nullish(),
  country_code: z.string().nullish(),
  channel: z.string().nullish(),
  reusable: z.boolean(),
});

export const initializeData = z.object({
  authorization_url: z.string().min(1),
  access_code: z.string().min(1),
  reference: z.string().min(1),
});

export const transactionData = z.object({
  id: providerId,
  status: z.string(),
  reference: z.string().min(1),
  amount: kobo,
  requested_amount: kobo.nullish(),
  fees: kobo.nullish(),
  currency: z.string().min(1),
  channel: z.string().nullish(),
  gateway_response: z.string().nullish(),
  paid_at: z.string().nullish(),
  // An authorization we cannot fully read is treated as absent, never as half a card.
  authorization: authorization.nullish().catch(null),
  customer: z.object({ email: z.string().nullish() }).nullish(),
});

export const chargeData = z.object({
  reference: z.string().min(1),
  status: z.string().nullish(),
  authorization_url: z.string().nullish(),
});

export { envelope };
