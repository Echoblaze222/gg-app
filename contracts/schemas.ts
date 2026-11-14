/**
 * FROZEN CONTRACT: Zod input schemas shared by server actions, route handlers and forms.
 * The server always validates with these. Forms may reuse them for early feedback, never as the only check.
 * Limits here are hard ceilings. Business limits (minimum and maximum contribution) come from SettingsRepository.
 */
import { z } from "zod";
import {
  CONTRIBUTION_FREQUENCIES,
  PAYMENT_CHANNELS,
  PAYMENT_PURPOSES,
  POLICY_KINDS,
  PRIVACY_REQUEST_KINDS,
} from "./enums";

/** Hard ceiling: 100 million naira in kobo. Far below Number.MAX_SAFE_INTEGER, so integer math stays exact. */
export const MAX_AMOUNT_KOBO = 100_000_000 * 100;

export const koboSchema = z.number().int().positive().max(MAX_AMOUNT_KOBO);

export const uuidSchema = z.uuid();

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, dash and underscore only.");

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const emailSchema = z.email().max(254).transform((v) => v.trim().toLowerCase());

/** Nigerian mobile numbers in local or international form. Normalization is done by AI-2. */
export const phoneSchema = z.string().regex(/^(\+234|0)[789][01]\d{8}$/, "Enter a valid Nigerian phone number.");

export const passwordSchema = z.string().min(10).max(128);

export const pageRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(512).nullish(),
});

export const registerInputSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  acceptedPolicyVersionIds: z.array(uuidSchema).min(1).max(10),
});

export const loginInputSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const createPlanInputSchema = z.object({
  frequency: z.enum(CONTRIBUTION_FREQUENCIES),
  amountKobo: koboSchema,
  startsOn: isoDateSchema,
  paymentMethodId: uuidSchema.optional(),
});

export const initiatePaymentInputSchema = z.object({
  purpose: z.enum(PAYMENT_PURPOSES),
  amountKobo: koboSchema,
  idempotencyKey: idempotencyKeySchema,
  obligationId: uuidSchema.optional(),
  paymentMethodId: uuidSchema.optional(),
  channel: z.enum(PAYMENT_CHANNELS).optional(),
});

export const payoutRequestInputSchema = z.object({
  amountKobo: koboSchema,
  bankCode: z.string().regex(/^\d{3,6}$/),
  accountNumber: z.string().regex(/^\d{10}$/, "Account numbers have 10 digits."),
  idempotencyKey: idempotencyKeySchema,
});

export const otpSchema = z.string().regex(/^\d{6}$/);

export const supportTicketInputSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(4000),
});

export const policyKindSchema = z.enum(POLICY_KINDS);

export const privacyRequestInputSchema = z.object({
  kind: z.enum(PRIVACY_REQUEST_KINDS),
});
