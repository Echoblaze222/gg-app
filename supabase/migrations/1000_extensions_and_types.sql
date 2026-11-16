-- 1000: extensions, enum types, shared helper functions.
-- Enum values mirror contracts/enums.ts. Add a value with ALTER TYPE ... ADD VALUE in a later migration.

create extension if not exists citext with schema public;
create extension if not exists pgcrypto with schema public;

create type currency_code as enum ('NGN');
create type role_name as enum ('owner', 'admin', 'support', 'member');
create type member_status as enum ('pending_verification', 'active', 'suspended', 'closed');
create type contribution_frequency as enum ('daily', 'weekly', 'monthly');
create type plan_status as enum ('active', 'paused', 'cancelled');
create type obligation_status as enum ('scheduled', 'due', 'paid', 'missed', 'cancelled');
create type payment_purpose as enum ('scheduled_contribution', 'one_time_contribution', 'card_authorization');
create type payment_channel as enum ('card', 'bank_transfer', 'ussd', 'manual_transfer');
create type payment_attempt_status as enum (
  'initiating', 'awaiting_authentication', 'processing', 'verifying',
  'successful', 'failed', 'cancelled', 'expired', 'reversed'
);
create type ledger_entry_type as enum (
  'contribution_credit', 'payout_debit', 'payout_reversal_credit',
  'refund_debit', 'adjustment_credit', 'adjustment_debit'
);
create type ledger_direction as enum ('credit', 'debit');
create type payout_status as enum (
  'requested', 'verified', 'approved', 'processing', 'paid', 'rejected', 'failed', 'cancelled'
);
create type refund_status as enum ('requested', 'approved', 'processing', 'completed', 'rejected', 'failed');
create type reconciliation_status as enum ('open', 'matched', 'discrepancy', 'resolved');
create type notification_type as enum (
  'contribution_due', 'contribution_reminder', 'contribution_missed', 'payment_successful',
  'payment_failed', 'payout_requested', 'payout_approved', 'payout_rejected', 'payout_paid',
  'security_alert', 'announcement', 'support_reply', 'policy_update'
);
create type notification_channel as enum ('in_app', 'email', 'sms');
create type support_ticket_status as enum ('open', 'pending_member', 'pending_staff', 'resolved', 'closed');
create type severity_level as enum ('info', 'low', 'medium', 'high', 'critical');
create type security_event_type as enum (
  'login_succeeded', 'login_failed', 'account_locked', 'password_changed', 'password_reset_requested',
  'mfa_enrolled', 'mfa_failed', 'new_device', 'session_revoked', 'rate_limited', 'permission_denied',
  'webhook_signature_invalid', 'role_changed', 'suspicious_activity'
);
create type audit_result as enum ('success', 'failure', 'denied');
create type policy_kind as enum ('terms', 'privacy', 'payment_terms', 'refund');
create type privacy_request_kind as enum ('access', 'export', 'correction', 'deletion');
create type privacy_request_status as enum ('received', 'in_review', 'completed', 'rejected');

-- Keeps updated_at honest. Attached per table.
create function set_updated_at() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Raises a contract error code. The data layer maps the message to an AppError.
create function raise_gg(code text) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '%', code using errcode = 'GG001';
end;
$$;
