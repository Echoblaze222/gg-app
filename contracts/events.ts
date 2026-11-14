/**
 * FROZEN CONTRACT: domain events.
 * Emitted only after an authoritative server side state change has been committed. Never from the client.
 * Consumers must tolerate duplicates and out of order delivery. Use `id` to de-duplicate.
 */
import type { Kobo, PaymentAttemptStatus, PayoutStatus, Role, SecurityEventType, Severity } from "./enums";
import type { IsoTimestamp, Uuid } from "./entities";

export interface EventEnvelope<Name extends string, Data> {
  /** Unique event id for de-duplication. */
  readonly id: Uuid;
  readonly name: Name;
  readonly occurredAt: IsoTimestamp;
  /** Correlation id that also appears in logs and error references. */
  readonly requestId: string;
  /** Who caused it. Null for system jobs. */
  readonly actorId: Uuid | null;
  readonly data: Data;
}

export interface DomainEventMap {
  "member.registered": { memberId: Uuid };
  "member.status_changed": { memberId: Uuid; from: string; to: string };
  "member.role_changed": { memberId: Uuid; added: Role[]; removed: Role[] };

  "plan.created": { planId: Uuid; memberId: Uuid };
  "plan.changed": { planId: Uuid; memberId: Uuid; change: "paused" | "resumed" | "cancelled" | "amount_changed" };
  "obligation.due": { obligationId: Uuid; memberId: Uuid; dueOn: string; amountKobo: Kobo };
  "obligation.missed": { obligationId: Uuid; memberId: Uuid; dueOn: string };

  "payment.status_changed": { attemptId: Uuid; memberId: Uuid; from: PaymentAttemptStatus; to: PaymentAttemptStatus };
  "payment.succeeded": { attemptId: Uuid; memberId: Uuid; amountKobo: Kobo; receiptNumber: string };
  "payment.failed": { attemptId: Uuid; memberId: Uuid; failureCode: string };
  "payment.reversed": { attemptId: Uuid; memberId: Uuid; amountKobo: Kobo };
  "payment_method.saved": { paymentMethodId: Uuid; memberId: Uuid };
  "payment_method.revoked": { paymentMethodId: Uuid; memberId: Uuid };
  "webhook.received": { providerEventId: string; eventType: string; signatureValid: boolean };

  "ledger.entry_posted": { entryId: Uuid; memberId: Uuid; entryType: string; amountKobo: Kobo };

  "payout.status_changed": { payoutId: Uuid; memberId: Uuid; from: PayoutStatus; to: PayoutStatus };
  "refund.status_changed": { refundId: Uuid; memberId: Uuid; to: string };
  "reconciliation.discrepancy_found": { recordId: Uuid; runId: Uuid };

  "notification.created": { notificationId: Uuid; memberId: Uuid };
  "support.ticket_changed": { ticketId: Uuid; memberId: Uuid; to: string };
  "policy.accepted": { memberId: Uuid; policyVersionId: Uuid };
  "privacy.request_created": { requestId: Uuid; memberId: Uuid; kind: string };

  "security.event_recorded": { eventId: Uuid; type: SecurityEventType; severity: Severity; memberId: Uuid | null };
}

export type DomainEventName = keyof DomainEventMap;

export type DomainEvent<N extends DomainEventName = DomainEventName> = {
  [K in N]: EventEnvelope<K, DomainEventMap[K]>;
}[N];

/** Every event name, for contract tests that check nothing is renamed or dropped. */
export const DOMAIN_EVENT_NAMES = [
  "member.registered",
  "member.status_changed",
  "member.role_changed",
  "plan.created",
  "plan.changed",
  "obligation.due",
  "obligation.missed",
  "payment.status_changed",
  "payment.succeeded",
  "payment.failed",
  "payment.reversed",
  "payment_method.saved",
  "payment_method.revoked",
  "webhook.received",
  "ledger.entry_posted",
  "payout.status_changed",
  "refund.status_changed",
  "reconciliation.discrepancy_found",
  "notification.created",
  "support.ticket_changed",
  "policy.accepted",
  "privacy.request_created",
  "security.event_recorded",
] as const satisfies readonly DomainEventName[];

/** Publishes events after commit. Implementation: AI-1 (transport), consumers: AI-4, AI-5. */
export interface EventBus {
  publish<N extends DomainEventName>(event: EventEnvelope<N, DomainEventMap[N]>): Promise<void>;
}
