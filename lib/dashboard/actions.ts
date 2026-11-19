"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/contracts/errors";
import type { Result } from "@/contracts/errors";
import { initiatePaymentInputSchema } from "@/contracts/schemas";
import type { InitiatePaymentOutput } from "@/contracts/services";
import type { PaymentAttempt } from "@/contracts/entities";
import { REFERENCE_PATTERN } from "@/lib/payments/callback";
import { buildRequestContext } from "./context";
import { safe } from "./safe";
import { getDashboardServices } from "./services";

export type ActionFailure = Extract<Result<never>, { ok: false }>;

const failure = (code: ConstructorParameters<typeof AppError>[0], reference: string, fields?: Record<string, string>): ActionFailure => ({
  ok: false,
  error: new AppError(code, { reference, fields }).toShape(),
});

/** Ends the session through AuthService, then sends the person to sign in. Returns only when sign out failed. */
export async function signOutAction(): Promise<ActionFailure> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  const result = await safe(ctx.requestId, () => services.auth.logout(ctx));
  if (!result.ok) return result;
  redirect("/login");
}

/**
 * Starts a payment. The service layer (AI-4) owns limits, permissions and the idempotency rules.
 * Defense in depth added here: a scheduled contribution must match the member's real next due obligation exactly,
 * so a tampered browser cannot pay a different amount against an obligation.
 */
export async function initiatePaymentAction(input: unknown): Promise<Result<InitiatePaymentOutput>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);

  const parsed = initiatePaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.map(String).join(".") || "_"] ??= issue.message;
    return failure("VALIDATION_FAILED", ctx.requestId, fields);
  }
  const data = parsed.data;

  if (data.purpose === "scheduled_contribution") {
    if (!data.obligationId) return failure("VALIDATION_FAILED", ctx.requestId, { obligationId: "Choose the contribution to pay." });
    const due = await safe(ctx.requestId, () => services.contributions.getNextDue(ctx));
    if (!due.ok) return due;
    if (due.value === null || due.value.id !== data.obligationId || due.value.amountKobo !== data.amountKobo) return failure("CONFLICT", ctx.requestId);
  }

  return safe(ctx.requestId, () => services.payments.initiate(ctx, data));
}

/** Asks the server to verify a reference with the provider and settle it. The server never trusts the browser's view of success. */
export async function verifyPaymentAction(input: { reference: string }): Promise<Result<PaymentAttempt>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  if (typeof input?.reference !== "string" || !REFERENCE_PATTERN.test(input.reference)) return failure("VALIDATION_FAILED", ctx.requestId, { reference: "This payment reference is not valid." });
  return safe(ctx.requestId, () => services.payments.verifyAndSettle(ctx, { reference: input.reference }));
}

export async function getAttemptAction(input: { attemptId: string }): Promise<Result<PaymentAttempt>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  if (typeof input?.attemptId !== "string" || input.attemptId.length === 0) return failure("VALIDATION_FAILED", ctx.requestId);
  return safe(ctx.requestId, () => services.payments.getAttempt(ctx, { attemptId: input.attemptId }));
}
