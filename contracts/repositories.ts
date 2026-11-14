/**
 * FROZEN CONTRACT: repository interfaces. Implemented by AI-1 in lib/db/. Used by AI-2, AI-4, AI-5.
 *
 * Rules every implementation must follow:
 * - Money and security tables are written only through the server (service role) repositories.
 * - Reads for a signed in member go through the session repositories so row level security applies.
 * - List methods use cursor pagination (Page), never offset.
 * - Methods that create or change money state are atomic and idempotent where noted.
 * - Repositories return domain entities from contracts/entities.ts, never raw database rows.
 */
import type {
  ContributionFrequency,
  Kobo,
  LedgerEntryType,
  NotificationType,
  ObligationStatus,
  PaymentAttemptStatus,
  PaymentChannel,
  PaymentPurpose,
  PayoutStatus,
  PlanStatus,
  PolicyKind,
  PrivacyRequestKind,
  RefundStatus,
  Role,
  SecurityEventType,
  Severity,
  SupportTicketStatus,
  AuditResult,
  MemberStatus,
  NotificationChannel,
} from "./enums";
import type {
  Announcement,
  AuditLogEntry,
  Balance,
  ContributionObligation,
  ContributionPlan,
  IsoDate,
  LedgerEntry,
  Member,
  Notification,
  Page,
  PageRequest,
  PaymentAttempt,
  PaymentEvent,
  PaymentMethodRef,
  PayoutRequest,
  PolicyAcceptance,
  PolicyVersion,
  PrivacyRequest,
  ReconciliationRecord,
  Refund,
  SecurityEvent,
  SupportMessage,
  SupportTicket,
  Uuid,
} from "./entities";

export interface MemberRepository {
  getById(id: Uuid): Promise<Member | null>;
  getByEmail(email: string): Promise<Member | null>;
  list(filter: { status?: MemberStatus; search?: string }, page: PageRequest): Promise<Page<Member>>;
  updateProfile(id: Uuid, patch: { fullName?: string; phone?: string | null }): Promise<Member>;
  setStatus(id: Uuid, status: MemberStatus): Promise<Member>;
}

export interface RoleRepository {
  listRoles(memberId: Uuid): Promise<Role[]>;
  /** Permission names the member holds through their roles. See contracts/permissions.md. */
  listPermissions(memberId: Uuid): Promise<string[]>;
  grant(memberId: Uuid, role: Role, grantedBy: Uuid): Promise<void>;
  revoke(memberId: Uuid, role: Role): Promise<void>;
}

export interface PlanRepository {
  getById(id: Uuid): Promise<ContributionPlan | null>;
  listByMember(memberId: Uuid): Promise<ContributionPlan[]>;
  create(input: { memberId: Uuid; frequency: ContributionFrequency; amountKobo: Kobo; startsOn: IsoDate; paymentMethodId?: Uuid | null }): Promise<ContributionPlan>;
  update(id: Uuid, patch: { amountKobo?: Kobo; status?: PlanStatus; paymentMethodId?: Uuid | null }): Promise<ContributionPlan>;
}

export interface ObligationRepository {
  getById(id: Uuid): Promise<ContributionObligation | null>;
  listByMember(memberId: Uuid, filter: { status?: ObligationStatus }, page: PageRequest): Promise<Page<ContributionObligation>>;
  /** Idempotent: unique on plan id and due date. Returns existing row if already generated. */
  generateIfAbsent(input: { planId: Uuid; memberId: Uuid; dueOn: IsoDate; amountKobo: Kobo }): Promise<{ obligation: ContributionObligation; created: boolean }>;
  /** Compare and set. Returns null when the current status is not `from`. */
  transition(id: Uuid, from: ObligationStatus, to: ObligationStatus, paidByAttemptId?: Uuid): Promise<ContributionObligation | null>;
  listDue(onOrBefore: IsoDate, page: PageRequest): Promise<Page<ContributionObligation>>;
}

export interface PaymentMethodRepository {
  /** Safe listing for the owner of the methods. */
  listByMember(memberId: Uuid): Promise<PaymentMethodRef[]>;
  getById(id: Uuid): Promise<PaymentMethodRef | null>;
  /** Idempotent on member id and provider card signature. */
  saveIfNew(input: Omit<PaymentMethodRef, "id" | "createdAt" | "revokedAt">): Promise<{ method: PaymentMethodRef; created: boolean }>;
  revoke(id: Uuid): Promise<void>;
}

export interface CreatePaymentAttemptInput {
  memberId: Uuid;
  purpose: PaymentPurpose;
  channel: PaymentChannel | null;
  amountKobo: Kobo;
  reference: string;
  idempotencyKey: string;
  obligationId?: Uuid | null;
  paymentMethodId?: Uuid | null;
}

export interface PaymentAttemptRepository {
  getById(id: Uuid): Promise<PaymentAttempt | null>;
  getByReference(reference: string): Promise<PaymentAttempt | null>;
  /**
   * Idempotent on (memberId, idempotencyKey). A repeat with the same key and same details returns the
   * existing attempt with created=false. The same key with different details is IDEMPOTENCY_KEY_REUSED.
   */
  createIdempotent(input: CreatePaymentAttemptInput): Promise<{ attempt: PaymentAttempt; created: boolean }>;
  /** Compare and set following PAYMENT_ATTEMPT_TRANSITIONS. Returns null when current status is not `from`. */
  transition(id: Uuid, from: PaymentAttemptStatus, to: PaymentAttemptStatus, patch?: { providerTransactionId?: string; failureCode?: string }): Promise<PaymentAttempt | null>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<PaymentAttempt>>;
  /** For the reconciliation job: attempts stuck in processing or verifying longer than `olderThanSeconds`. */
  listStuck(olderThanSeconds: number, page: PageRequest): Promise<Page<PaymentAttempt>>;
  listFailedOrPending(page: PageRequest): Promise<Page<PaymentAttempt>>;
}

export interface PaymentEventRepository {
  /**
   * Stores the raw event first. Idempotent on providerEventId: returns inserted=false for a duplicate.
   * Must be called before any processing.
   */
  recordIfNew(input: { providerEventId: string; eventType: string; rawPayload: unknown; signatureValid: boolean }): Promise<{ event: PaymentEvent; inserted: boolean }>;
  markProcessed(id: Uuid, result: { attemptId?: Uuid | null; error?: string | null }): Promise<void>;
  listUnprocessed(page: PageRequest): Promise<Page<PaymentEvent>>;
}

export interface PostLedgerEntryInput {
  memberId: Uuid;
  entryType: LedgerEntryType;
  amountKobo: Kobo;
  paymentAttemptId?: Uuid | null;
  payoutId?: Uuid | null;
  refundId?: Uuid | null;
  reason?: string | null;
  receiptNumber?: string | null;
  createdBy?: Uuid | null;
}

export interface LedgerRepository {
  /**
   * Appends one entry in a single transaction that locks the member's balance row.
   * Debits that would make the balance negative fail with LEDGER_NEGATIVE_BALANCE.
   * A contribution_credit is idempotent on paymentAttemptId: a repeat returns the existing entry with created=false.
   * There is no update and no delete. Corrections are new adjustment entries.
   */
  post(input: PostLedgerEntryInput): Promise<{ entry: LedgerEntry; created: boolean }>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<LedgerEntry>>;
  getBalance(memberId: Uuid): Promise<Balance>;
  getReceipt(receiptNumber: string): Promise<LedgerEntry | null>;
}

export interface PayoutRepository {
  getById(id: Uuid): Promise<PayoutRequest | null>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<PayoutRequest>>;
  listByStatus(status: PayoutStatus, page: PageRequest): Promise<Page<PayoutRequest>>;
  /** Fails with PAYOUT_ALREADY_OPEN when the member has an open payout, and with PAYOUT_INSUFFICIENT_BALANCE when available balance is too low. Atomic. */
  createIfNoneOpen(input: {
    memberId: Uuid;
    amountKobo: Kobo;
    destinationBankCode: string;
    destinationBankName: string;
    destinationAccountNumber: string;
    destinationAccountName?: string | null;
  }): Promise<PayoutRequest>;
  /** Compare and set following PAYOUT_TRANSITIONS. Returns null when the current status is not `from`. */
  transition(id: Uuid, from: PayoutStatus, to: PayoutStatus, patch?: { decidedBy?: Uuid; decisionNote?: string; providerTransferRef?: string }): Promise<PayoutRequest | null>;
}

export interface RefundRepository {
  getById(id: Uuid): Promise<Refund | null>;
  listByStatus(status: RefundStatus, page: PageRequest): Promise<Page<Refund>>;
  create(input: { paymentAttemptId: Uuid; memberId: Uuid; amountKobo: Kobo; reason: string; requestedBy: Uuid }): Promise<Refund>;
  transition(id: Uuid, from: RefundStatus, to: RefundStatus, patch?: { decidedBy?: Uuid; providerRefundRef?: string }): Promise<Refund | null>;
}

export interface ReconciliationRepository {
  startRun(): Promise<{ runId: Uuid }>;
  record(input: Omit<ReconciliationRecord, "id" | "createdAt" | "resolvedAt" | "resolvedBy">): Promise<ReconciliationRecord>;
  listOpen(page: PageRequest): Promise<Page<ReconciliationRecord>>;
  resolve(id: Uuid, resolvedBy: Uuid, note: string): Promise<ReconciliationRecord>;
}

export interface NotificationRepository {
  create(input: { memberId: Uuid; type: NotificationType; channel: NotificationChannel; title: string; body: string; link?: string | null }): Promise<Notification>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<Notification>>;
  unreadCount(memberId: Uuid): Promise<number>;
  markRead(memberId: Uuid, ids: Uuid[]): Promise<void>;
  markAllRead(memberId: Uuid): Promise<void>;
}

export interface AnnouncementRepository {
  create(input: { title: string; body: string; createdBy: Uuid }): Promise<Announcement>;
  publish(id: Uuid): Promise<Announcement>;
  listPublished(page: PageRequest): Promise<Page<Announcement>>;
}

export interface SupportRepository {
  createTicket(input: { memberId: Uuid; subject: string; body: string }): Promise<SupportTicket>;
  addMessage(input: { ticketId: Uuid; authorId: Uuid; fromStaff: boolean; body: string }): Promise<SupportMessage>;
  setStatus(ticketId: Uuid, status: SupportTicketStatus): Promise<SupportTicket>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<SupportTicket>>;
  listByStatus(status: SupportTicketStatus, page: PageRequest): Promise<Page<SupportTicket>>;
  listMessages(ticketId: Uuid, page: PageRequest): Promise<Page<SupportMessage>>;
}

export interface SecurityEventRepository {
  record(input: { type: SecurityEventType; severity: Severity; memberId?: Uuid | null; ip?: string | null; userAgent?: string | null; requestId?: string | null; detail?: Record<string, unknown> }): Promise<SecurityEvent>;
  list(filter: { type?: SecurityEventType; minSeverity?: Severity; memberId?: Uuid }, page: PageRequest): Promise<Page<SecurityEvent>>;
  /** Counts events of a type for a subject since a time. Used by lockout and anomaly rules. */
  countSince(input: { type: SecurityEventType; memberId?: Uuid | null; ip?: string | null; sinceSeconds: number }): Promise<number>;
}

export interface AuditRepository {
  /** Append only. */
  record(input: { actorId: Uuid | null; action: string; targetType?: string | null; targetId?: string | null; result: AuditResult; ip?: string | null; requestId?: string | null; detail?: Record<string, unknown> }): Promise<AuditLogEntry>;
  list(filter: { actorId?: Uuid; action?: string; targetId?: string }, page: PageRequest): Promise<Page<AuditLogEntry>>;
}

export interface RateLimitRepository {
  /**
   * Atomically counts a hit in a fixed window and returns the count including this hit.
   * `key` is built by the caller, for example "login:ip:1.2.3.4".
   */
  hit(key: string, windowSeconds: number): Promise<{ count: number; windowEndsAt: string }>;
}

export interface PolicyRepository {
  getLatest(kind: PolicyKind): Promise<PolicyVersion | null>;
  listVersions(kind: PolicyKind): Promise<PolicyVersion[]>;
  accept(input: { memberId: Uuid; policyVersionId: Uuid; ip?: string | null }): Promise<PolicyAcceptance>;
  listAcceptances(memberId: Uuid): Promise<PolicyAcceptance[]>;
}

export interface PrivacyRequestRepository {
  create(input: { memberId: Uuid; kind: PrivacyRequestKind }): Promise<PrivacyRequest>;
  listByMember(memberId: Uuid): Promise<PrivacyRequest[]>;
  listOpen(page: PageRequest): Promise<Page<PrivacyRequest>>;
}

export interface SettingsRepository {
  /** System configuration, for example contribution limits, payout rules, trust thresholds. Admin only writes, audited by the caller. */
  get(key: string): Promise<string | null>;
  getAll(): Promise<Record<string, string>>;
  set(key: string, value: string, updatedBy: Uuid): Promise<void>;
}

export interface Repositories {
  members: MemberRepository;
  roles: RoleRepository;
  plans: PlanRepository;
  obligations: ObligationRepository;
  paymentMethods: PaymentMethodRepository;
  paymentAttempts: PaymentAttemptRepository;
  paymentEvents: PaymentEventRepository;
  ledger: LedgerRepository;
  payouts: PayoutRepository;
  refunds: RefundRepository;
  reconciliation: ReconciliationRepository;
  notifications: NotificationRepository;
  announcements: AnnouncementRepository;
  support: SupportRepository;
  securityEvents: SecurityEventRepository;
  audit: AuditRepository;
  rateLimits: RateLimitRepository;
  policies: PolicyRepository;
  privacyRequests: PrivacyRequestRepository;
  settings: SettingsRepository;
}

export interface RepositoryProvider {
  /** Service role. Server only. Used for ledger, payment, audit and security writes. */
  server(): Repositories;
  /** Scoped to the signed in member so row level security applies. Throws AUTH_SESSION_EXPIRED when there is no session. */
  forSession(): Promise<Repositories>;
}
