/**
 * In memory repositories for the payment service tests. They live under tests/ on purpose (shared rule 4).
 * They enforce the same rules the real tables will: compare and set transitions that only follow the frozen state
 * tables, unique keys, idempotent credit, no negative balance.
 *
 * Two test tools are built in:
 * - faults: make the Nth call of a named operation fail before it runs, or "crash" after it committed
 *   (it ran, then the caller sees an exception, like a process dying right after a commit).
 * - interleaving: every operation yields a random number of times first, driven by a seed, so concurrent
 *   callers interleave in many different orders.
 */
import { AppError } from "@/contracts/errors";
import type {
  ContributionObligation,
  Page,
  PaymentEvent,
  PaymentMethodRef,
  ReconciliationRecord,
  Uuid,
} from "@/contracts/entities";
import type { LedgerEntryType, ObligationStatus, PaymentAttemptStatus } from "@/contracts/enums";
import type { PostLedgerEntryInput } from "@/contracts/repositories";
import { OBLIGATION_TRANSITIONS, PAYMENT_ATTEMPT_TERMINAL, canTransition, PAYMENT_ATTEMPT_TRANSITIONS } from "@/contracts/state-machines";
import type { CreatePaymentAttemptInput } from "@/contracts/repositories";
import type { LedgerEntryV11, PaymentAttemptRepositoryV11, PaymentAttemptV11 } from "@/contracts/v1_1";

export class CrashError extends Error {
  constructor(where: string) {
    super(`simulated crash after ${where}`);
    this.name = "CrashError";
  }
}

export function receiptConflictError(): Error {
  return Object.assign(new Error("receipt number already used"), { code: "LEDGER_RECEIPT_CONFLICT" });
}

interface Fault {
  when: "before" | "after";
  error: Error;
  remaining: number;
  /** Calls to let through untouched before the fault starts. */
  skip: number;
}

/** Mulberry32: small, seeded, good enough to shuffle interleavings. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MemoryStore {
  now = new Date("2026-11-17T10:00:00.000Z");
  private counter = 0;
  private faults = new Map<string, Fault[]>();
  /** How many times each repository operation was called. */
  readonly counts = new Map<string, number>();
  private rand: (() => number) | null = null;

  /** Make operations yield a random number of times so concurrent callers interleave. */
  interleave(seed: number): void {
    this.rand = seededRandom(seed);
  }

  /** Back to a calm store: no interleaving, no pending faults. */
  quiet(): void {
    this.rand = null;
    this.faults.clear();
  }

  failBefore(op: string, error: Error, times = 1, skip = 0): void {
    this.addFault(op, { when: "before", error, remaining: times, skip });
  }
  /** The operation commits, then the caller gets a CrashError. `skip` lets that many earlier calls through. */
  crashAfter(op: string, times = 1, skip = 0): void {
    this.addFault(op, { when: "after", error: new CrashError(op), remaining: times, skip });
  }
  private addFault(op: string, fault: Fault): void {
    const list = this.faults.get(op) ?? [];
    list.push(fault);
    this.faults.set(op, list);
  }
  private takeFault(op: string, when: "before" | "after"): Error | null {
    const list = this.faults.get(op);
    const fault = list?.find((f) => f.when === when && f.remaining > 0);
    if (!fault) return null;
    if (fault.skip > 0) {
      fault.skip -= 1;
      return null;
    }
    fault.remaining -= 1;
    return fault.error;
  }

  id(): Uuid {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;
  }
  iso(): string {
    return this.now.toISOString();
  }

  async gate<T>(op: string, run: () => T): Promise<T> {
    this.counts.set(op, (this.counts.get(op) ?? 0) + 1);
    if (this.rand) for (let n = Math.floor(this.rand() * 4); n > 0; n -= 1) await Promise.resolve();
    const before = this.takeFault(op, "before");
    if (before) throw before;
    const result = run(); // synchronous, so every repository call is atomic like a database transaction
    const after = this.takeFault(op, "after");
    if (after) throw after;
    return result;
  }

  readonly attemptsMap = new Map<Uuid, PaymentAttemptV11>();
  readonly obligationsMap = new Map<Uuid, ContributionObligation>();
  readonly ledgerEntries: LedgerEntryV11[] = [];
  readonly methodsList: PaymentMethodRef[] = [];
  readonly eventsList: PaymentEvent[] = [];
  readonly reconciliationRecords: ReconciliationRecord[] = [];
  readonly settingsMap = new Map<string, string>();
  readonly membersMap = new Map<Uuid, { id: Uuid; email: string; status: "active" | "pending_verification" | "suspended" | "closed" }>();
  private readonly balances = new Map<Uuid, number>();
  private readonly receipts = new Set<string>();
  /** Set false to simulate a repository that does not compare details on an idempotent repeat. */
  enforceKeyDetails = true;

  // ---------- repositories ----------

  attempts: PaymentAttemptRepositoryV11 = {
    getById: (id) => this.gate("attempts.getById", () => this.attemptsMap.get(id) ?? null),
    getByReference: (reference) => this.gate("attempts.getByReference", () => [...this.attemptsMap.values()].find((a) => a.reference === reference) ?? null),
    createIdempotent: (input: CreatePaymentAttemptInput) =>
      this.gate("attempts.createIdempotent", () => {
        const existing = [...this.attemptsMap.values()].find((a) => a.memberId === input.memberId && a.idempotencyKey === input.idempotencyKey);
        if (existing) {
          const same =
            existing.purpose === input.purpose &&
            existing.amountKobo === input.amountKobo &&
            existing.obligationId === (input.obligationId ?? null) &&
            existing.channel === input.channel;
          if (this.enforceKeyDetails && !same) throw new AppError("IDEMPOTENCY_KEY_REUSED", { reference: "test" });
          return { attempt: existing, created: false };
        }
        if ([...this.attemptsMap.values()].some((a) => a.reference === input.reference)) throw new Error("duplicate reference");
        const now = this.iso();
        const attempt: PaymentAttemptV11 = {
          id: this.id(),
          memberId: input.memberId,
          purpose: input.purpose,
          channel: input.channel,
          amountKobo: input.amountKobo,
          currency: "NGN",
          status: "initiating",
          reference: input.reference,
          idempotencyKey: input.idempotencyKey,
          obligationId: input.obligationId ?? null,
          paymentMethodId: input.paymentMethodId ?? null,
          providerTransactionId: null,
          failureCode: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          providerAccessCode: null,
        };
        this.attemptsMap.set(attempt.id, attempt);
        return { attempt, created: true };
      }),
    transition: (id, from, to, patch) =>
      this.gate("attempts.transition", () => {
        const current = this.attemptsMap.get(id);
        if (!current || current.status !== from) return null;
        if (!canTransition(PAYMENT_ATTEMPT_TRANSITIONS, from, to)) throw new Error(`illegal transition ${from} to ${to}`);
        const finished = to === "successful" || (PAYMENT_ATTEMPT_TERMINAL as readonly PaymentAttemptStatus[]).includes(to);
        const next: PaymentAttemptV11 = {
          ...current,
          status: to,
          updatedAt: this.iso(),
          completedAt: finished ? this.iso() : current.completedAt,
          providerTransactionId: patch?.providerTransactionId ?? current.providerTransactionId,
          failureCode: patch?.failureCode ?? current.failureCode,
          providerAccessCode: patch?.providerAccessCode ?? current.providerAccessCode,
        };
        this.attemptsMap.set(id, next);
        return next;
      }),
    listByMember: (memberId) => this.gate("attempts.listByMember", () => ({ items: [...this.attemptsMap.values()].filter((a) => a.memberId === memberId), nextCursor: null })),
    listStuck: () => this.gate("attempts.listStuck", () => ({ items: [], nextCursor: null })),
    listFailedOrPending: () => this.gate("attempts.listFailedOrPending", () => ({ items: [], nextCursor: null })),
    listByObligation: (obligationId) => this.gate("attempts.listByObligation", () => [...this.attemptsMap.values()].filter((a) => a.obligationId === obligationId)),
  };

  ledger = {
    post: (input: PostLedgerEntryInput) =>
      this.gate("ledger.post", () => {
        if (input.entryType === "contribution_credit" && input.paymentAttemptId) {
          const existing = this.ledgerEntries.find((e) => e.entryType === "contribution_credit" && e.paymentAttemptId === input.paymentAttemptId);
          if (existing) return { entry: existing, created: false };
        }
        if (input.receiptNumber && this.receipts.has(input.receiptNumber)) throw receiptConflictError();
        const credit = (["contribution_credit", "payout_reversal_credit", "adjustment_credit"] as LedgerEntryType[]).includes(input.entryType);
        const balance = this.balances.get(input.memberId) ?? 0;
        const after = credit ? balance + input.amountKobo : balance - input.amountKobo;
        if (after < 0) throw new AppError("LEDGER_NEGATIVE_BALANCE", { reference: "test" });
        this.balances.set(input.memberId, after);
        if (input.receiptNumber) this.receipts.add(input.receiptNumber);
        const entry: LedgerEntryV11 = {
          id: this.id(),
          memberId: input.memberId,
          entryType: input.entryType,
          direction: credit ? "credit" : "debit",
          amountKobo: input.amountKobo,
          currency: "NGN",
          paymentAttemptId: input.paymentAttemptId ?? null,
          payoutId: input.payoutId ?? null,
          refundId: input.refundId ?? null,
          reason: input.reason ?? null,
          receiptNumber: input.receiptNumber ?? null,
          createdBy: input.createdBy ?? null,
          createdAt: this.iso(),
          balanceAfterKobo: after,
        };
        this.ledgerEntries.push(entry);
        return { entry, created: true };
      }),
  };

  obligations = {
    getById: (id: Uuid) => this.gate("obligations.getById", () => this.obligationsMap.get(id) ?? null),
    transition: (id: Uuid, from: ObligationStatus, to: ObligationStatus, paidByAttemptId?: Uuid) =>
      this.gate("obligations.transition", () => {
        const current = this.obligationsMap.get(id);
        if (!current || current.status !== from) return null;
        if (!canTransition(OBLIGATION_TRANSITIONS, from, to)) throw new Error(`illegal obligation transition ${from} to ${to}`);
        const next = { ...current, status: to, paidByAttemptId: paidByAttemptId ?? current.paidByAttemptId, updatedAt: this.iso() };
        this.obligationsMap.set(id, next);
        return next;
      }),
  };

  methods = {
    saveIfNew: (input: Omit<PaymentMethodRef, "id" | "createdAt" | "revokedAt">) =>
      this.gate("methods.saveIfNew", () => {
        const existing = this.methodsList.find((m) => m.memberId === input.memberId && m.providerCardSignature === input.providerCardSignature);
        if (existing) return { method: existing, created: false };
        const method: PaymentMethodRef = { ...input, id: this.id(), createdAt: this.iso(), revokedAt: null };
        this.methodsList.push(method);
        return { method, created: true };
      }),
  };

  events = {
    recordIfNew: (input: { providerEventId: string; eventType: string; rawPayload: unknown; signatureValid: boolean }) =>
      this.gate("events.recordIfNew", () => {
        const existing = this.eventsList.find((e) => e.providerEventId === input.providerEventId);
        if (existing) return { event: existing, inserted: false };
        const event: PaymentEvent = {
          id: this.id(),
          provider: "paystack",
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          rawPayload: input.rawPayload,
          signatureValid: input.signatureValid,
          receivedAt: this.iso(),
          processedAt: null,
          processingError: null,
          attemptId: null,
        };
        this.eventsList.push(event);
        return { event, inserted: true };
      }),
    markProcessed: (id: Uuid, result: { attemptId?: Uuid | null; error?: string | null }) =>
      this.gate("events.markProcessed", () => {
        const i = this.eventsList.findIndex((e) => e.id === id);
        if (i < 0) throw new Error("unknown event");
        const prev = this.eventsList[i] as PaymentEvent;
        this.eventsList[i] = { ...prev, processedAt: this.iso(), processingError: result.error ?? null, attemptId: result.attemptId ?? prev.attemptId };
      }),
    /** Unprocessed, or processed with an error. This is requirement 13 in the AI-1 handoff. */
    listUnprocessed: (): Promise<Page<PaymentEvent>> =>
      this.gate("events.listUnprocessed", () => ({ items: this.eventsList.filter((e) => e.processedAt === null || e.processingError !== null), nextCursor: null })),
  };

  reconciliation = {
    startRun: () => this.gate("reconciliation.startRun", () => ({ runId: this.id() })),
    record: (input: Omit<ReconciliationRecord, "id" | "createdAt" | "resolvedAt" | "resolvedBy">) =>
      this.gate("reconciliation.record", () => {
        const record: ReconciliationRecord = { ...input, id: this.id(), createdAt: this.iso(), resolvedAt: null, resolvedBy: null };
        this.reconciliationRecords.push(record);
        return record;
      }),
  };

  settings = {
    get: (key: string) => this.gate("settings.get", () => this.settingsMap.get(key) ?? null),
  };

  members = {
    getById: (id: Uuid) =>
      this.gate("members.getById", () => {
        const m = this.membersMap.get(id);
        if (!m) return null;
        return { id: m.id, email: m.email, phone: null, fullName: "Test Member", status: m.status, roles: ["member" as const], emailVerifiedAt: null, createdAt: this.iso(), updatedAt: this.iso() };
      }),
  };

  // ---------- inspection ----------

  credits(): LedgerEntryV11[] {
    return this.ledgerEntries.filter((e) => e.entryType === "contribution_credit");
  }
  balanceOf(memberId: Uuid): number {
    return this.balances.get(memberId) ?? 0;
  }
}
