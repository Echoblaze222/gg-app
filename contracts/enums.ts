/**
 * FROZEN CONTRACT: enums.
 * Change only through a request file in docs/handoffs/. Additions are cheap, removals and renames are breaking.
 * Every enum is a const tuple so the same list feeds TypeScript types, Zod schemas and database enums.
 */

export const CONTRACT_VERSION = "1.0.0";

export const CURRENCIES = ["NGN"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Money is always an integer number of kobo. 100 kobo = 1 naira. Never a float. */
export type Kobo = number;

export const ROLES = ["owner", "admin", "support", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may sign in to the admin app. They must use MFA. */
export const PRIVILEGED_ROLES = ["owner", "admin", "support"] as const satisfies readonly Role[];

export const MEMBER_STATUSES = ["pending_verification", "active", "suspended", "closed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CONTRIBUTION_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type ContributionFrequency = (typeof CONTRIBUTION_FREQUENCIES)[number];

export const PLAN_STATUSES = ["active", "paused", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const OBLIGATION_STATUSES = ["scheduled", "due", "paid", "missed", "cancelled"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const PAYMENT_PURPOSES = ["scheduled_contribution", "one_time_contribution", "card_authorization"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/** manual_transfer exists only if the owner keeps the legacy admin confirmed bank transfer flow. */
export const PAYMENT_CHANNELS = ["card", "bank_transfer", "ussd", "manual_transfer"] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/**
 * Server side payment attempt states. Enforced in code (contracts/state-machines.ts) and by a database check.
 * "idle" is a client only UI state and is not stored.
 */
export const PAYMENT_ATTEMPT_STATUSES = [
  "initiating",
  "awaiting_authentication",
  "processing",
  "verifying",
  "successful",
  "failed",
  "cancelled",
  "expired",
  "reversed",
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  "contribution_credit",
  "payout_debit",
  "payout_reversal_credit",
  "refund_debit",
  "adjustment_credit",
  "adjustment_debit",
  "payment_reversal_debit",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_DIRECTIONS = ["credit", "debit"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const PAYOUT_STATUSES = [
  "requested",
  "verified",
  "approved",
  "processing",
  "paid",
  "rejected",
  "failed",
  "cancelled",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Statuses in which a payout holds the member's money. At most one open payout per member. */
export const OPEN_PAYOUT_STATUSES = ["requested", "verified", "approved", "processing"] as const satisfies readonly PayoutStatus[];

export const REFUND_STATUSES = ["requested", "approved", "processing", "completed", "rejected", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const RECONCILIATION_STATUSES = ["open", "matched", "discrepancy", "resolved"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "contribution_due",
  "contribution_reminder",
  "contribution_missed",
  "payment_successful",
  "payment_failed",
  "payout_requested",
  "payout_approved",
  "payout_rejected",
  "payout_paid",
  "security_alert",
  "announcement",
  "support_reply",
  "policy_update",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const SUPPORT_TICKET_STATUSES = ["open", "pending_member", "pending_staff", "resolved", "closed"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SECURITY_EVENT_TYPES = [
  "login_succeeded",
  "login_failed",
  "account_locked",
  "password_changed",
  "password_reset_requested",
  "mfa_enrolled",
  "mfa_failed",
  "new_device",
  "session_revoked",
  "rate_limited",
  "permission_denied",
  "webhook_signature_invalid",
  "role_changed",
  "suspicious_activity",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const AUDIT_RESULTS = ["success", "failure", "denied"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const POLICY_KINDS = ["terms", "privacy", "payment_terms", "refund"] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const PRIVACY_REQUEST_KINDS = ["access", "export", "correction", "deletion"] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

export const PRIVACY_REQUEST_STATUSES = ["received", "in_review", "completed", "rejected"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/** Client side action state model from the pack (section 3.4). Never stored, never trusted by the server. */
export const UI_ACTION_STATES = [
  "idle",
  "validating",
  "processing",
  "success",
  "recoverable_failure",
  "terminal_failure",
] as const;
export type UiActionState = (typeof UI_ACTION_STATES)[number];
