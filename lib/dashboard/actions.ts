"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/contracts/errors";
import type { Result } from "@/contracts/errors";
import { initiatePaymentInputSchema } from "@/contracts/schemas";
import type { InitiatePaymentOutput } from "@/contracts/services";
import type { Notification, Page, PaymentAttempt } from "@/contracts/entities";
import { loadHistoryPage } from "./history-loader";
import type { HistoryPageData } from "./history-loader";
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

const validCursor = (c: unknown): c is string | null => c === null || (typeof c === "string" && c.length > 0 && c.length <= 500);

/** Next page of payment history for the "Load more" button. */
export async function loadHistoryPageAction(input: { cursor: string | null }): Promise<Result<HistoryPageData>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  if (!validCursor(input?.cursor)) return failure("VALIDATION_FAILED", ctx.requestId);
  return loadHistoryPage(services, ctx, input.cursor);
}

export async function listNotificationsAction(input: { cursor: string | null }): Promise<Result<Page<Notification>>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  if (!validCursor(input?.cursor)) return failure("VALIDATION_FAILED", ctx.requestId);
  return safe(ctx.requestId, () => services.notifications.list(ctx, { limit: 20, cursor: input.cursor }));
}

export async function unreadCountAction(): Promise<Result<number>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  return safe(ctx.requestId, () => services.notifications.unreadCount(ctx));
}

/** The service validates ids and the member id comes from the session, never from here. */
export async function markReadAction(input: { ids: string[] }): Promise<Result<void>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  if (!Array.isArray(input?.ids) || input.ids.length === 0 || input.ids.length > 100 || input.ids.some((i) => typeof i !== "string")) return failure("VALIDATION_FAILED", ctx.requestId);
  return safe(ctx.requestId, () => services.notifications.markRead(ctx, { ids: input.ids }));
}

export async function markAllReadAction(): Promise<Result<void>> {
  const ctx = await buildRequestContext();
  const services = getDashboardServices();
  if (!services) return failure("SYSTEM_UNAVAILABLE", ctx.requestId);
  return safe(ctx.requestId, () => services.notifications.markAllRead(ctx));
}
