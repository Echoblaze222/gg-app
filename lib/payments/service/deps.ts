/**
 * Everything the payment service needs from the outside, as interfaces.
 * Production wiring (route handlers, M6) passes real implementations. Tests pass the doubles in tests/payments/.
 * This file holds no keys: the webhook signature check arrives as a function already bound to its secret.
 */
import type { EventBus } from "@/contracts/events";
import type {
  MemberRepository,
  ObligationRepository,
  PaymentEventRepository,
  PaymentMethodRepository,
  ReconciliationRepository,
  SettingsRepository,
} from "@/contracts/repositories";
import type {
  AuthorizationService,
  NotificationService,
  RateLimiter,
  RateLimitRule,
  SecurityEventService,
} from "@/contracts/services";
import type { LedgerRepositoryV11, PaymentAttemptRepositoryV11 } from "@/contracts/v1_1";
import type { PaymentProvider } from "../provider/types";
import type { RandomBytes } from "../random";

export interface PaymentRepos {
  members: Pick<MemberRepository, "getById">;
  attempts: PaymentAttemptRepositoryV11;
  ledger: Pick<LedgerRepositoryV11, "post">;
  obligations: Pick<ObligationRepository, "getById" | "transition">;
  methods: Pick<PaymentMethodRepository, "saveIfNew">;
  events: PaymentEventRepository;
  reconciliation: Pick<ReconciliationRepository, "startRun" | "record">;
  settings: Pick<SettingsRepository, "get">;
}

export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

/** Operational log. Callers pass fixed event names and scalar ids only, never provider bodies, keys or card data. */
export interface OpsLog {
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface PaymentServiceDeps {
  repos: PaymentRepos;
  provider: PaymentProvider;
  authz: Pick<AuthorizationService, "requirePermission">;
  rateLimiter: RateLimiter;
  bus: EventBus;
  notifications: Pick<NotificationService, "notify">;
  securityEvents: SecurityEventService;
  /** Checks x-paystack-signature over the raw body. Bound to the secret by the wiring code, never reads it here. */
  verifyWebhookSignature: (input: { rawBody: string; signatureHeader: string | null }) => boolean;
  /** Absolute site URL from NEXT_PUBLIC_APP_URL. The provider returns the member to `${appUrl}/app/pay/return`. */
  appUrl: string;
  log: OpsLog;
  now: () => Date;
  newId: () => string;
  randomBytes?: RandomBytes;
}

/** Fixed rules. Not money limits, so they are constants and not settings. */
export const PAYMENT_INITIATE_RULE: RateLimitRule = { name: "payment_initiate", limit: 10, windowSeconds: 60 };
export const PAYMENT_VERIFY_RULE: RateLimitRule = { name: "payment_verify", limit: 30, windowSeconds: 60 };
export const WEBHOOK_FORGED_RULE: RateLimitRule = { name: "webhook_forged", limit: 20, windowSeconds: 60 };

export const SETTING_MIN_KOBO = "contribution.min_kobo";
export const SETTING_MAX_KOBO = "contribution.max_kobo";
export const SETTING_ALLOWED_CHECKOUT_HOSTS = "payment.allowed_checkout_hosts";
