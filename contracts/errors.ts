/**
 * FROZEN CONTRACT: error taxonomy.
 * Every failure in the system maps to one code here. Each code says what failed, whether money moved,
 * what the person should do, and whether retrying is safe. No generic "something went wrong" copy.
 */

export type MoneyMoved = "no" | "yes" | "unknown";

export interface ErrorDefinition {
  /** HTTP status for API routes. */
  readonly status: number;
  /** Stable key for translation and tests. */
  readonly messageKey: string;
  /** Default English copy shown to people. No technical detail, no secrets. */
  readonly message: string;
  /** Whether money moved because of this failure. "unknown" means reconciliation must settle it. */
  readonly moneyMoved: MoneyMoved;
  /** Whether the same request can be repeated without risk. For money, only with the same idempotency key. */
  readonly retrySafe: boolean;
  /** What the person should do next. */
  readonly action: string;
}

function def(
  status: number,
  messageKey: string,
  message: string,
  moneyMoved: MoneyMoved,
  retrySafe: boolean,
  action: string,
): ErrorDefinition {
  return { status, messageKey, message, moneyMoved, retrySafe, action };
}

export const ERROR_DEFINITIONS = {
  // Validation and request
  VALIDATION_FAILED: def(400, "error.validation_failed", "Some details are missing or not valid.", "no", true, "Check the highlighted fields and try again."),
  PAYLOAD_TOO_LARGE: def(413, "error.payload_too_large", "The request was too large.", "no", true, "Send a smaller request."),
  NOT_FOUND: def(404, "error.not_found", "We could not find that.", "no", false, "Check the link or go back."),
  CONFLICT: def(409, "error.conflict", "This was changed by someone else.", "no", true, "Refresh and try again."),
  IDEMPOTENCY_KEY_REUSED: def(409, "error.idempotency_key_reused", "This request was already sent with different details.", "no", false, "Start the action again from the beginning."),

  // Authentication and session
  AUTH_INVALID_CREDENTIALS: def(401, "error.auth_invalid_credentials", "The email, phone or password is not correct.", "no", true, "Check your details and try again."),
  AUTH_ACCOUNT_LOCKED: def(423, "error.auth_account_locked", "Too many attempts. Sign in is paused for a short time.", "no", false, "Wait a few minutes, or reset your password."),
  AUTH_SESSION_EXPIRED: def(401, "error.auth_session_expired", "Your session ended.", "unknown", false, "Sign in again. If you were paying, check your payment history first."),
  AUTH_REAUTH_REQUIRED: def(403, "error.auth_reauth_required", "Please confirm your password to continue.", "no", true, "Confirm your password, then repeat the action."),
  AUTH_MFA_REQUIRED: def(403, "error.auth_mfa_required", "A verification code is needed.", "no", true, "Enter the code from your authenticator app."),
  AUTH_MFA_INVALID: def(401, "error.auth_mfa_invalid", "That code is not correct or has expired.", "no", true, "Enter a new code."),
  AUTH_EMAIL_NOT_VERIFIED: def(403, "error.auth_email_not_verified", "Verify your email to continue.", "no", true, "Open the verification link we sent you."),
  AUTH_ACCOUNT_SUSPENDED: def(403, "error.auth_account_suspended", "This account is suspended.", "no", false, "Contact support."),
  AUTH_PASSWORD_WEAK: def(400, "error.auth_password_weak", "That password is too easy to guess.", "no", true, "Choose a longer password with a mix of characters."),
  AUTH_RESET_LINK_INVALID: def(400, "error.auth_reset_link_invalid", "This reset link has expired or was already used.", "no", false, "Request a new reset link."),

  // Authorization and abuse
  PERMISSION_DENIED: def(403, "error.permission_denied", "You do not have access to do this.", "no", false, "Ask the owner for access if you need it."),
  RATE_LIMITED: def(429, "error.rate_limited", "Too many requests. Please slow down.", "no", true, "Wait a moment and try again."),
  CSRF_INVALID: def(403, "error.csrf_invalid", "This request could not be verified.", "no", true, "Reload the page and try again."),

  // Payments
  PAYMENT_AMOUNT_INVALID: def(400, "error.payment_amount_invalid", "That amount is not allowed.", "no", true, "Enter an amount within the allowed range."),
  PAYMENT_DUPLICATE_IN_PROGRESS: def(409, "error.payment_duplicate_in_progress", "A payment for this is already in progress. You were not charged twice.", "unknown", false, "Wait for the first payment to finish."),
  PAYMENT_PROVIDER_UNAVAILABLE: def(503, "error.payment_provider_unavailable", "Payments are temporarily unavailable. You were not charged.", "no", true, "Try again in a few minutes. Your saved plan is safe."),
  PAYMENT_PROVIDER_TIMEOUT: def(504, "error.payment_provider_timeout", "We are waiting for confirmation from the payment provider. Check your history before trying again.", "unknown", false, "Check your payment history. We will update it when confirmed."),
  PAYMENT_DECLINED: def(402, "error.payment_declined", "The payment was declined. You were not charged.", "no", true, "Try another card or payment method."),
  PAYMENT_INSUFFICIENT_FUNDS: def(402, "error.payment_insufficient_funds", "There was not enough money available. You were not charged.", "no", true, "Add funds or use another method."),
  PAYMENT_AUTH_REQUIRED: def(402, "error.payment_auth_required", "Your bank needs you to approve this payment.", "no", true, "Complete the bank approval step."),
  PAYMENT_AUTH_FAILED: def(402, "error.payment_auth_failed", "The bank approval did not complete. You were not charged.", "no", true, "Start the payment again."),
  PAYMENT_ABANDONED: def(410, "error.payment_abandoned", "This payment was not completed and has expired. You were not charged.", "no", true, "Start a new payment."),
  PAYMENT_NOT_REUSABLE: def(400, "error.payment_not_reusable", "This saved card cannot be used for scheduled payments.", "no", false, "Add a different card."),
  PAYMENT_REVERSED: def(409, "error.payment_reversed", "This payment was reversed.", "yes", false, "Contact support if you need help."),

  // Webhooks and provider (internal, never shown raw)
  WEBHOOK_SIGNATURE_INVALID: def(401, "error.webhook_signature_invalid", "Webhook signature is not valid.", "no", false, "Reject the event and record a security event."),
  WEBHOOK_DUPLICATE: def(200, "error.webhook_duplicate", "Event was already processed.", "no", true, "Acknowledge and ignore."),
  PROVIDER_VERIFY_MISMATCH: def(502, "error.provider_verify_mismatch", "The provider record does not match our record.", "unknown", false, "Reconciliation will review it."),

  // Contributions and plans
  PLAN_NOT_ACTIVE: def(409, "error.plan_not_active", "This plan is not active.", "no", false, "Resume the plan or create a new one."),
  CONTRIBUTION_OUT_OF_RANGE: def(400, "error.contribution_out_of_range", "That amount is outside the allowed range.", "no", true, "Choose an amount within the limits shown."),

  // Payouts and ledger
  PAYOUT_INSUFFICIENT_BALANCE: def(409, "error.payout_insufficient_balance", "Your available balance is lower than that amount.", "no", true, "Request a smaller amount."),
  PAYOUT_ALREADY_OPEN: def(409, "error.payout_already_open", "You already have a withdrawal waiting to be processed.", "no", false, "Wait for it to finish or cancel it."),
  PAYOUT_NOT_ELIGIBLE: def(403, "error.payout_not_eligible", "Withdrawals are not available on this account right now.", "no", false, "Contact support."),
  PAYOUT_OTP_INVALID: def(400, "error.payout_otp_invalid", "That code is not correct or has expired.", "no", true, "Request a new code."),
  PAYOUT_TRANSITION_INVALID: def(409, "error.payout_transition_invalid", "This withdrawal cannot be changed that way.", "no", false, "Refresh to see its current status."),
  PAYOUT_DISBURSEMENT_FAILED: def(502, "error.payout_disbursement_failed", "The transfer failed. Your balance was not reduced.", "no", false, "Contact support if this repeats."),
  LEDGER_NEGATIVE_BALANCE: def(409, "error.ledger_negative_balance", "This would make the balance negative, so it was blocked.", "no", false, "Contact support."),
  LEDGER_IMMUTABLE: def(500, "error.ledger_immutable", "Ledger records cannot be changed.", "no", false, "Use an adjustment entry."),

  // Platform
  SYSTEM_UNAVAILABLE: def(503, "error.system_unavailable", "The service is temporarily unavailable.", "unknown", true, "Try again shortly. Check your history before repeating a payment."),
  SYSTEM_TIMEOUT: def(504, "error.system_timeout", "The request took too long.", "unknown", false, "Check your history before trying again."),
  SYSTEM_MAINTENANCE: def(503, "error.system_maintenance", "We are doing planned maintenance.", "no", true, "Come back shortly."),
  INTERNAL: def(500, "error.internal", "Something failed on our side. We have recorded it.", "unknown", false, "Quote the reference below if you contact support."),
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

/** Safe shape sent to clients. No stack, no internals. `reference` is the correlation id also written to logs. */
export interface AppErrorShape {
  readonly code: ErrorCode;
  readonly message: string;
  readonly messageKey: string;
  readonly moneyMoved: MoneyMoved;
  readonly retrySafe: boolean;
  readonly action: string;
  readonly reference: string;
  /** Field level messages for forms, keyed by field name. */
  readonly fields?: Readonly<Record<string, string>>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly reference: string;
  readonly fields?: Readonly<Record<string, string>>;
  /** Internal detail for logs only. Never sent to clients. */
  readonly internal?: string;

  constructor(code: ErrorCode, opts: { reference: string; fields?: Record<string, string>; internal?: string; cause?: unknown }) {
    super(ERROR_DEFINITIONS[code].message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.reference = opts.reference;
    this.fields = opts.fields;
    this.internal = opts.internal;
  }

  toShape(): AppErrorShape {
    const d = ERROR_DEFINITIONS[this.code];
    return {
      code: this.code,
      message: d.message,
      messageKey: d.messageKey,
      moneyMoved: d.moneyMoved,
      retrySafe: d.retrySafe,
      action: d.action,
      reference: this.reference,
      fields: this.fields,
    };
  }
}

/** Result type used by every service method. Services return errors, they do not throw for expected failures. */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppErrorShape };
