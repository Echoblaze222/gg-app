/**
 * FROZEN CONTRACT: service interfaces.
 * Implemented by: AuthService, AuthorizationService, RateLimiter, AuditService, SecurityEventService (AI-2);
 * PaymentService, ContributionService, PayoutService, ReceiptService, ReconciliationService (AI-4);
 * NotificationService, SupportService, PolicyService, PrivacyService (AI-5).
 * Callers outside the owning AI use these interfaces only. Expected failures come back as Result, not as exceptions.
 */
import type { Result } from "./errors";
import type {
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
  PaymentMethodView,
  PayoutRequest,
  PolicyAcceptance,
  PolicyVersion,
  PrivacyRequest,
  Refund,
  SupportMessage,
  SupportTicket,
  Uuid,
} from "./entities";
import type {
  AuditResult,
  ContributionFrequency,
  Kobo,
  NotificationType,
  PaymentChannel,
  PaymentPurpose,
  PolicyKind,
  PrivacyRequestKind,
  Role,
  SecurityEventType,
  Severity,
} from "./enums";
import type { PermissionName } from "./permissions";

/** Carried through every call so logs, audit rows and error references share one correlation id. */
export interface RequestContext {
  readonly requestId: string;
  readonly actorId: Uuid | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

// ---------- AI-2: security and auth ----------

export interface SessionInfo {
  memberId: Uuid;
  roles: Role[];
  /** True when the member recently confirmed their password. Needed for sensitive actions. */
  recentlyReauthenticated: boolean;
  mfaVerified: boolean;
}

export interface DeviceSession {
  id: Uuid;
  deviceLabel: string;
  ip: string | null;
  lastSeenAt: string;
  current: boolean;
}

export interface AuthService {
  register(ctx: RequestContext, input: { fullName: string; email: string; phone?: string; password: string; acceptedPolicyVersionIds: Uuid[] }): Promise<Result<{ memberId: Uuid; verificationSent: boolean }>>;
  login(ctx: RequestContext, input: { identifier: string; password: string }): Promise<Result<{ mfaRequired: boolean }>>;
  verifyMfa(ctx: RequestContext, input: { code: string }): Promise<Result<void>>;
  logout(ctx: RequestContext): Promise<Result<void>>;
  getSession(ctx: RequestContext): Promise<Result<SessionInfo>>;
  requestPasswordReset(ctx: RequestContext, input: { identifier: string }): Promise<Result<void>>;
  resetPassword(ctx: RequestContext, input: { token: string; newPassword: string }): Promise<Result<void>>;
  changePassword(ctx: RequestContext, input: { currentPassword: string; newPassword: string }): Promise<Result<void>>;
  /** Confirms the password again before a sensitive action. */
  reauthenticate(ctx: RequestContext, input: { password: string }): Promise<Result<void>>;
  listDevices(ctx: RequestContext): Promise<Result<DeviceSession[]>>;
  revokeDevice(ctx: RequestContext, input: { deviceId: Uuid }): Promise<Result<void>>;
}

export interface AuthorizationService {
  /** Throws nothing. Returns PERMISSION_DENIED, AUTH_SESSION_EXPIRED, AUTH_MFA_REQUIRED or AUTH_REAUTH_REQUIRED as needed. */
  requirePermission(ctx: RequestContext, permission: PermissionName, opts?: { requireReauth?: boolean }): Promise<Result<SessionInfo>>;
  grantRole(ctx: RequestContext, input: { memberId: Uuid; role: Role }): Promise<Result<void>>;
  revokeRole(ctx: RequestContext, input: { memberId: Uuid; role: Role }): Promise<Result<void>>;
}

export interface RateLimitRule {
  /** Name of the rule, for example "login" or "payment_initiate". */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimiter {
  /** Checks per IP and per account when a member id is present. Records a rate_limited security event when blocked. */
  check(ctx: RequestContext, rule: RateLimitRule, opts?: { memberId?: Uuid | null }): Promise<Result<{ remaining: number }>>;
}

export interface AuditService {
  record(ctx: RequestContext, entry: { action: string; targetType?: string; targetId?: string; result: AuditResult; detail?: Record<string, unknown> }): Promise<void>;
}

export interface SecurityEventService {
  record(ctx: RequestContext, event: { type: SecurityEventType; severity: Severity; memberId?: Uuid | null; detail?: Record<string, unknown> }): Promise<void>;
}

/** Generic provider webhook signature check. Compares in constant time. */
export interface WebhookVerifier {
  verify(input: { rawBody: string; signatureHeader: string | null; secret: string }): boolean;
}

// ---------- AI-4: payments and contributions ----------

export interface InitiatePaymentInput {
  purpose: PaymentPurpose;
  amountKobo: Kobo;
  /** Client generated, unique per user action. A repeated tap must send the same key. */
  idempotencyKey: string;
  obligationId?: Uuid;
  paymentMethodId?: Uuid;
  channel?: PaymentChannel;
}

export interface InitiatePaymentOutput {
  attempt: PaymentAttempt;
  /** Where to send the member to complete provider hosted payment. Null when a saved method charged without a redirect. */
  authorizationUrl: string | null;
}

export interface PaymentService {
  initiate(ctx: RequestContext, input: InitiatePaymentInput): Promise<Result<InitiatePaymentOutput>>;
  /** Called when the member returns from the provider. Always verifies with the provider, never trusts the client. */
  verifyAndSettle(ctx: RequestContext, input: { reference: string }): Promise<Result<PaymentAttempt>>;
  getAttempt(ctx: RequestContext, input: { attemptId: Uuid }): Promise<Result<PaymentAttempt>>;
  listHistory(ctx: RequestContext, page: PageRequest): Promise<Result<Page<PaymentAttempt>>>;
  listMethods(ctx: RequestContext): Promise<Result<PaymentMethodView[]>>;
  removeMethod(ctx: RequestContext, input: { paymentMethodId: Uuid }): Promise<Result<void>>;
  /** Admin: refund request, approval and reconciliation. */
  requestRefund(ctx: RequestContext, input: { attemptId: Uuid; amountKobo: Kobo; reason: string }): Promise<Result<Refund>>;
  decideRefund(ctx: RequestContext, input: { refundId: Uuid; approve: boolean }): Promise<Result<Refund>>;
}

export interface ReceiptData {
  receiptNumber: string;
  memberId: Uuid;
  memberName: string;
  amountKobo: Kobo;
  currency: "NGN";
  channel: PaymentChannel | null;
  providerReference: string;
  paidAt: string;
  balanceAfterKobo: Kobo;
}

export interface ReceiptService {
  getReceipt(ctx: RequestContext, input: { receiptNumber: string }): Promise<Result<ReceiptData>>;
}

export interface ContributionService {
  createPlan(ctx: RequestContext, input: { frequency: ContributionFrequency; amountKobo: Kobo; startsOn: IsoDate; paymentMethodId?: Uuid }): Promise<Result<ContributionPlan>>;
  updatePlan(ctx: RequestContext, input: { planId: Uuid; amountKobo?: Kobo; action?: "pause" | "resume" | "cancel" }): Promise<Result<ContributionPlan>>;
  listPlans(ctx: RequestContext): Promise<Result<ContributionPlan[]>>;
  listObligations(ctx: RequestContext, page: PageRequest): Promise<Result<Page<ContributionObligation>>>;
  getNextDue(ctx: RequestContext): Promise<Result<ContributionObligation | null>>;
  getBalance(ctx: RequestContext): Promise<Result<Balance>>;
  listLedger(ctx: RequestContext, page: PageRequest): Promise<Result<Page<LedgerEntry>>>;
}

export interface PayoutService {
  /** Starts a withdrawal request. Step up verification follows. */
  request(ctx: RequestContext, input: { amountKobo: Kobo; bankCode: string; accountNumber: string; idempotencyKey: string }): Promise<Result<PayoutRequest>>;
  sendOtp(ctx: RequestContext, input: { payoutId: Uuid }): Promise<Result<void>>;
  verifyOtp(ctx: RequestContext, input: { payoutId: Uuid; code: string }): Promise<Result<PayoutRequest>>;
  cancel(ctx: RequestContext, input: { payoutId: Uuid }): Promise<Result<PayoutRequest>>;
  listMine(ctx: RequestContext, page: PageRequest): Promise<Result<Page<PayoutRequest>>>;
  /** Admin actions. Require reauthentication. All audited. */
  listForReview(ctx: RequestContext, page: PageRequest): Promise<Result<Page<PayoutRequest>>>;
  approve(ctx: RequestContext, input: { payoutId: Uuid; note?: string }): Promise<Result<PayoutRequest>>;
  reject(ctx: RequestContext, input: { payoutId: Uuid; note: string }): Promise<Result<PayoutRequest>>;
  markPaid(ctx: RequestContext, input: { payoutId: Uuid; providerTransferRef: string }): Promise<Result<PayoutRequest>>;
}

export interface ReconciliationService {
  /** Compares provider records to the ledger, resolves stuck attempts through the provider verify endpoint. */
  run(ctx: RequestContext): Promise<Result<{ runId: Uuid; checked: number; discrepancies: number }>>;
}

// ---------- AI-5: communication, support, legal ----------

export interface NotificationService {
  /** Used by AI-4 and AI-2 to tell a member something. Delivery channels are decided by the service. */
  notify(ctx: RequestContext, input: { memberId: Uuid; type: NotificationType; title: string; body: string; link?: string }): Promise<Result<Notification>>;
  list(ctx: RequestContext, page: PageRequest): Promise<Result<Page<Notification>>>;
  unreadCount(ctx: RequestContext): Promise<Result<number>>;
  markRead(ctx: RequestContext, input: { ids: Uuid[] }): Promise<Result<void>>;
  markAllRead(ctx: RequestContext): Promise<Result<void>>;
}

export interface SupportService {
  createTicket(ctx: RequestContext, input: { subject: string; body: string }): Promise<Result<SupportTicket>>;
  reply(ctx: RequestContext, input: { ticketId: Uuid; body: string }): Promise<Result<SupportMessage>>;
  listMine(ctx: RequestContext, page: PageRequest): Promise<Result<Page<SupportTicket>>>;
}

export interface PolicyService {
  getCurrent(kind: PolicyKind): Promise<Result<PolicyVersion>>;
  accept(ctx: RequestContext, input: { policyVersionId: Uuid }): Promise<Result<PolicyAcceptance>>;
  listAcceptances(ctx: RequestContext): Promise<Result<PolicyAcceptance[]>>;
}

export interface PrivacyService {
  createRequest(ctx: RequestContext, input: { kind: PrivacyRequestKind }): Promise<Result<PrivacyRequest>>;
  listMine(ctx: RequestContext): Promise<Result<PrivacyRequest[]>>;
}

export interface MemberService {
  getMe(ctx: RequestContext): Promise<Result<Member>>;
  updateMe(ctx: RequestContext, input: { fullName?: string; phone?: string | null }): Promise<Result<Member>>;
}
