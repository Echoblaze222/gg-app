/**
 * CONTRACT v1.1.0: additive extensions to the frozen v1.0.0 contract.
 * Nothing in the v1.0.0 files is changed or removed. New code that needs these items imports from this file.
 * Each extension interface extends its v1.0.0 interface, so anything written against v1.0.0 still type checks.
 * Origin of every item: docs/handoffs/integrator-decisions-001.md (answers to the AI-2, AI-4 and AI-5 requests).
 * Implemented by AI-1 (repositories), AI-2, AI-4, AI-5 (services) as noted on each interface.
 */
import type { Result } from "./errors";
import type {
  Kobo,
  MemberStatus,
  PaymentAttemptStatus,
  PayoutStatus,
  PolicyKind,
  PrivacyRequestStatus,
  SupportTicketStatus,
} from "./enums";
import type {
  Announcement,
  ContributionPlan,
  IsoTimestamp,
  LedgerEntry,
  Member,
  Page,
  PageRequest,
  PaymentAttempt,
  PolicyVersion,
  PrivacyRequest,
  Refund,
  SupportMessage,
  SupportTicket,
  Uuid,
} from "./entities";
import type {
  CreatePaymentAttemptInput,
  LedgerRepository,
  PaymentAttemptRepository,
  PlanRepository,
  PolicyRepository,
  PostLedgerEntryInput,
  PrivacyRequestRepository,
  RefundRepository,
  SupportRepository,
} from "./repositories";
import type { PolicyService, PrivacyService, RequestContext, SupportService } from "./services";

export const CONTRACT_VERSION_V11 = "1.1.0" as const;

// ---------- Payments (AI-4 requests CR-1 to CR-5, implemented by AI-1) ----------

/** CR-1: lets a repeated tap return the same provider checkout. Server side only, never sent to the client. */
export interface PaymentAttemptV11 extends PaymentAttempt {
  providerAccessCode: string | null;
}

export interface PaymentAttemptRepositoryV11 extends PaymentAttemptRepository {
  getById(id: Uuid): Promise<PaymentAttemptV11 | null>;
  getByReference(reference: string): Promise<PaymentAttemptV11 | null>;
  createIdempotent(input: CreatePaymentAttemptInput): Promise<{ attempt: PaymentAttemptV11; created: boolean }>;
  /** Compare and set. `patch.providerAccessCode` is new in v1.1.0 (CR-1). */
  transition(
    id: Uuid,
    from: PaymentAttemptStatus,
    to: PaymentAttemptStatus,
    patch?: { providerTransactionId?: string; failureCode?: string; providerAccessCode?: string },
  ): Promise<PaymentAttemptV11 | null>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<PaymentAttemptV11>>;
  listStuck(olderThanSeconds: number, page: PageRequest): Promise<Page<PaymentAttemptV11>>;
  listFailedOrPending(page: PageRequest): Promise<Page<PaymentAttemptV11>>;
  /** CR-3: all attempts for one obligation, oldest first. Used by the charge retry policy. */
  listByObligation(obligationId: Uuid): Promise<PaymentAttemptV11[]>;
}

/** CR-2: immutable snapshot of the member balance right after this entry, set inside the locked ledger transaction. */
export interface LedgerEntryV11 extends LedgerEntry {
  balanceAfterKobo: Kobo;
}

export interface LedgerRepositoryV11 extends LedgerRepository {
  post(input: PostLedgerEntryInput): Promise<{ entry: LedgerEntryV11; created: boolean }>;
  listByMember(memberId: Uuid, page: PageRequest): Promise<Page<LedgerEntryV11>>;
  getReceipt(receiptNumber: string): Promise<LedgerEntryV11 | null>;
}

export interface PlanRepositoryV11 extends PlanRepository {
  /** CR-4: active plans only, cursor paginated, for obligation generation. */
  listActive(page: PageRequest): Promise<Page<ContributionPlan>>;
}

export interface RefundRepositoryV11 extends RefundRepository {
  /** CR-5: all refunds of one payment attempt. */
  listByAttempt(paymentAttemptId: Uuid): Promise<Refund[]>;
}

/** CR-7: storage for withdrawal one time codes. The code is hashed with OTP_PEPPER, never stored in clear text. */
export interface PayoutOtpRecord {
  payoutId: Uuid;
  codeHash: string;
  expiresAt: IsoTimestamp;
  attemptsLeft: number;
  usedAt: IsoTimestamp | null;
}

export interface PayoutOtpRepository {
  /** Replaces any earlier active code for the payout. */
  issue(input: { payoutId: Uuid; codeHash: string; expiresAt: IsoTimestamp; maxAttempts: number }): Promise<void>;
  getActive(payoutId: Uuid): Promise<PayoutOtpRecord | null>;
  /** Returns attempts left after recording the failure. */
  recordFailedAttempt(payoutId: Uuid): Promise<number>;
  /** Compare and set. True exactly once. */
  markUsed(payoutId: Uuid): Promise<boolean>;
}

/** AI-5 request 5: aggregate counts for the admin dashboard, so screens never list every row to count. Read only. */
export interface AdminCountsRepository {
  countPayoutsByStatus(): Promise<Record<PayoutStatus, number>>;
  countAttemptsByStatus(input: { olderThanSeconds?: number }): Promise<Record<PaymentAttemptStatus, number>>;
  countOpenReconciliationRecords(): Promise<number>;
  countTicketsByStatus(): Promise<Record<SupportTicketStatus, number>>;
}

// ---------- Security (AI-2 request, implemented by AI-1 and AI-2) ----------

export interface DeviceSessionRecord {
  id: Uuid;
  /** The session_id claim of the access token. */
  sessionId: string;
  memberId: Uuid;
  deviceLabel: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

export interface DeviceSessionRepository {
  /** Called on login and refresh. */
  upsert(input: { sessionId: string; memberId: Uuid; deviceLabel: string; ip: string | null; userAgent: string | null }): Promise<DeviceSessionRecord>;
  listActiveByMember(memberId: Uuid): Promise<DeviceSessionRecord[]>;
  getBySessionId(sessionId: string): Promise<DeviceSessionRecord | null>;
  revoke(memberId: Uuid, deviceId: Uuid): Promise<boolean>;
  /** Returns how many sessions were revoked. */
  revokeAllExcept(memberId: Uuid, keepSessionId: string): Promise<number>;
}

// ---------- Product repositories (AI-5 requests 1 to 3, implemented by AI-1) ----------

export interface SupportRepositoryV11 extends SupportRepository {
  getTicket(ticketId: Uuid): Promise<SupportTicket | null>;
}

export interface PrivacyRequestRepositoryV11 extends PrivacyRequestRepository {
  getById(id: Uuid): Promise<PrivacyRequest | null>;
  /** Compare and set following received, in_review, then completed or rejected. Returns null when the current status is not `from`. */
  setStatus(id: Uuid, from: PrivacyRequestStatus, to: PrivacyRequestStatus, decidedBy: Uuid): Promise<PrivacyRequest | null>;
}

export interface PolicyRepositoryV11 extends PolicyRepository {
  /** Creates a new version. `draft` stays true until a qualified Nigerian legal review signs it off. */
  publish(input: { kind: PolicyKind; version: string; body: string; draft: boolean; publishedBy: Uuid }): Promise<PolicyVersion>;
}

// ---------- Services ----------

/** AI-5 request 1. Staff methods require admin.support.read, and admin.support.reply for staffReply and setStatus. */
export interface SupportServiceV11 extends SupportService {
  getTicket(ctx: RequestContext, input: { ticketId: Uuid }): Promise<Result<SupportTicket>>;
  listMessages(ctx: RequestContext, input: { ticketId: Uuid }, page: PageRequest): Promise<Result<Page<SupportMessage>>>;
  listForStaff(ctx: RequestContext, input: { status?: SupportTicketStatus }, page: PageRequest): Promise<Result<Page<SupportTicket>>>;
  staffReply(ctx: RequestContext, input: { ticketId: Uuid; body: string }): Promise<Result<SupportMessage>>;
  setStatus(ctx: RequestContext, input: { ticketId: Uuid; status: SupportTicketStatus }): Promise<Result<SupportTicket>>;
}

/** AI-5 request 2. Admin methods require admin.privacy.manage and are audited. */
export interface PrivacyServiceV11 extends PrivacyService {
  listOpen(ctx: RequestContext, page: PageRequest): Promise<Result<Page<PrivacyRequest>>>;
  /** See the interim deletion rule in docs/handoffs/integrator-decisions-001.md. */
  decide(ctx: RequestContext, input: { requestId: Uuid; approve: boolean; note?: string }): Promise<Result<PrivacyRequest>>;
}

/** AI-5 request 3. publish requires admin.policies.manage and is audited. */
export interface PolicyServiceV11 extends PolicyService {
  /** Current policy versions the signed in member has not accepted yet. */
  listUnaccepted(ctx: RequestContext): Promise<Result<PolicyVersion[]>>;
  publish(ctx: RequestContext, input: { kind: PolicyKind; version: string; body: string; draft: boolean }): Promise<Result<PolicyVersion>>;
}

/** AI-5 request 4. Owned and implemented by AI-5. Publishing fans out in app notifications in batches, idempotent per announcement and member. Requires admin.announcements.manage. */
export interface AnnouncementService {
  create(ctx: RequestContext, input: { title: string; body: string }): Promise<Result<Announcement>>;
  publish(ctx: RequestContext, input: { announcementId: Uuid }): Promise<Result<Announcement>>;
  listPublished(ctx: RequestContext, page: PageRequest): Promise<Result<Page<Announcement>>>;
}

/** AI-5 request 6. Admin screens use this, never a repository directly. Requires admin.members.read, and admin.members.suspend (with reauthentication) to change status. */
export interface AdminMemberService {
  list(ctx: RequestContext, input: { status?: MemberStatus; search?: string }, page: PageRequest): Promise<Result<Page<Member>>>;
  get(ctx: RequestContext, input: { memberId: Uuid }): Promise<Result<Member>>;
  setStatus(ctx: RequestContext, input: { memberId: Uuid; status: MemberStatus; reason: string }): Promise<Result<Member>>;
}

export interface Bank {
  code: string;
  name: string;
}

/** AI-5 request 7. Owned and implemented by AI-4 through the payment provider adapter. Endpoints must be confirmed in the provider's official docs. Rate limited. */
export interface BankDirectoryService {
  /** Safe to cache. */
  listBanks(ctx: RequestContext): Promise<Result<Bank[]>>;
  /** The account name must be shown to the member for confirmation before a withdrawal can continue. */
  resolveAccount(ctx: RequestContext, input: { bankCode: string; accountNumber: string }): Promise<Result<{ accountName: string }>>;
}
