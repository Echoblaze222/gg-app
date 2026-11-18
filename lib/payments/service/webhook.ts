/**
 * Webhook service (spec section 6 and 17). The route handler (M6) reads the raw body and calls `receive`.
 *
 * Rules, each with a named test:
 * - Signature is checked on the raw body before anything is parsed or stored (webhook.forged).
 * - Only verified events are stored. Forged ones become rate limited security events (Integrator decision).
 * - The body is a hint. It selects a reference to verify with the provider and nothing else (A3).
 * - What is stored is an allowlist of scalar fields, never the authorization code or card signature.
 * - Duplicates and out of order delivery are safe because settlement reads provider truth and is idempotent.
 */
import { createHash } from "node:crypto";
import type { PaymentEvent } from "@/contracts/entities";
import type { Result } from "@/contracts/errors";
import type { RequestContext } from "@/contracts/services";
import { parseProviderJson } from "../provider/json";
import { isValidReference } from "../reference";
import { WEBHOOK_FORGED_RULE, type PaymentServiceDeps } from "./deps";
import { createEmitter, systemContext } from "./emitter";
import { fail, failFromThrown, ok, thrownKind } from "./results";
import type { Settler } from "./settle";

export const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_EVENT_ID_LENGTH = 200;
const MAX_SWEEP_EVENTS = 200;
const SWEEP_PAGE = 50;

/**
 * What happened to a delivery.
 * processed: handled, or deliberately ignored, and marked done.
 * duplicate: already done, nothing repeated.
 * deferred: stored and left for a later milestone's handler (refund events, M5).
 * error: stored, processing failed, will run again (next delivery or sweep).
 */
export type WebhookOutcome = "processed" | "duplicate" | "deferred" | "error";

export interface WebhookService {
  receive(ctx: RequestContext, input: { rawBody: string; signatureHeader: string | null }): Promise<Result<{ outcome: WebhookOutcome }>>;
  /** Runs stored events that were never finished again. Called by the reconcile job. */
  reprocessPending(ctx: RequestContext, opts?: { maxEvents?: number }): Promise<Result<{ examined: number; processed: number; deferred: number; errored: number }>>;
}

type Scalar = string | number | boolean | null;

/** What `payment_events.raw_payload` holds. No authorization, customer, card or metadata objects. */
export interface StoredWebhookPayload {
  readonly event: string;
  readonly bodySha256: string;
  readonly data: Readonly<Record<string, Scalar>>;
}

const SAFE_DATA_KEYS = [
  "id",
  "reference",
  "status",
  "amount",
  "requested_amount",
  "currency",
  "channel",
  "paid_at",
  "gateway_response",
  "fees",
  "domain",
  "transaction_reference",
  "refund_reference",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseEvent(rawBody: string): { event: string; data: Record<string, unknown> } | null {
  const value = parseProviderJson(rawBody);
  if (!isRecord(value)) return null;
  const { event, data } = value;
  if (typeof event !== "string" || event.length === 0 || event.length > 100 || !isRecord(data)) return null;
  return { event, data };
}

/** Allowlist, so a field Paystack adds later (or a card reference) is dropped by default. */
export function sanitizeWebhook(event: string, data: Record<string, unknown>, bodySha256: string): StoredWebhookPayload {
  const kept: Record<string, Scalar> = {};
  for (const key of SAFE_DATA_KEYS) {
    const v = data[key];
    if (typeof v === "string") kept[key] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) kept[key] = v;
  }
  return { event, bodySha256, data: kept };
}

/**
 * Paystack documents no event id. A dedupe aid only: `event:data.id:data.status` when both exist,
 * else the hash of the raw body. Correctness rests on idempotent settlement (A1), not on this key.
 */
export function deriveProviderEventId(event: string, data: Record<string, unknown>, bodySha256: string): string {
  const id = data.id;
  const status = data.status;
  if ((typeof id === "string" || typeof id === "number") && typeof status === "string") {
    const key = `${event}:${id}:${status}`;
    if (key.length <= MAX_EVENT_ID_LENGTH) return key;
  }
  return bodySha256;
}

function readStored(value: unknown): StoredWebhookPayload | null {
  if (!isRecord(value) || typeof value.event !== "string" || typeof value.bodySha256 !== "string" || !isRecord(value.data)) return null;
  return value as unknown as StoredWebhookPayload;
}

/** An event needs processing when it was never finished, or finished with an error. */
function needsProcessing(event: PaymentEvent): boolean {
  return event.processedAt === null || event.processingError !== null;
}

type Handling = "settle" | "defer" | "ignore";

function classify(event: string): Handling {
  if (event === "charge.success") return "settle";
  if (event.startsWith("refund.")) return "defer";
  return "ignore";
}

export function createWebhookService(deps: PaymentServiceDeps, settler: Settler): WebhookService {
  const { repos, log } = deps;
  const emit = createEmitter(deps);

  async function recordForged(ctx: RequestContext, rawBody: string): Promise<void> {
    try {
      const limited = await deps.rateLimiter.check(ctx, WEBHOOK_FORGED_RULE, { memberId: null });
      if (!limited.ok) return; // flood: keep answering 401, stop writing rows
      await deps.securityEvents.record(ctx, { type: "webhook_signature_invalid", severity: "medium", detail: { bodyBytes: Buffer.byteLength(rawBody, "utf8") } });
    } catch (err) {
      log.warn("webhook.forged_record_failed", { kind: thrownKind(err) });
    }
  }

  /** Runs one stored event. Calls markProcessed exactly once unless the event is deferred. */
  async function processStored(ctx: RequestContext, stored: PaymentEvent): Promise<WebhookOutcome> {
    const payload = readStored(stored.rawPayload);
    if (payload === null) {
      log.warn("webhook.stored_payload_unreadable", { eventId: stored.id });
      await repos.events.markProcessed(stored.id, {});
      return "processed";
    }

    switch (payload.event === "unparseable" ? "ignore" : classify(payload.event)) {
      case "defer":
        return "deferred";
      case "ignore":
        await repos.events.markProcessed(stored.id, {});
        return "processed";
      case "settle": {
        const reference = payload.data.reference;
        if (typeof reference !== "string" || !isValidReference(reference)) {
          // Not one of ours (another use of the same provider account). Nothing to settle, nothing to retry.
          log.warn("webhook.foreign_reference", { eventId: stored.id });
          await repos.events.markProcessed(stored.id, {});
          return "processed";
        }
        const settled = await settler.settleByReference(systemContext(ctx.requestId), reference);
        if (settled.ok) {
          await repos.events.markProcessed(stored.id, { attemptId: settled.value.id });
          return "processed";
        }
        if (settled.error.code === "NOT_FOUND") {
          log.warn("webhook.unknown_attempt", { eventId: stored.id });
          await repos.events.markProcessed(stored.id, {});
          return "processed";
        }
        await repos.events.markProcessed(stored.id, { error: settled.error.code });
        return "error";
      }
    }
  }

  async function receive(ctx: RequestContext, input: { rawBody: string; signatureHeader: string | null }): Promise<Result<{ outcome: WebhookOutcome }>> {
    try {
      if (Buffer.byteLength(input.rawBody, "utf8") > MAX_WEBHOOK_BYTES) return fail("PAYLOAD_TOO_LARGE", ctx.requestId);

      if (!deps.verifyWebhookSignature({ rawBody: input.rawBody, signatureHeader: input.signatureHeader })) {
        await recordForged(ctx, input.rawBody);
        return fail("WEBHOOK_SIGNATURE_INVALID", ctx.requestId);
      }

      const bodySha256 = sha256Hex(input.rawBody);
      const parsed = parseEvent(input.rawBody);
      const payload: StoredWebhookPayload = parsed ? sanitizeWebhook(parsed.event, parsed.data, bodySha256) : { event: "unparseable", bodySha256, data: {} };
      const providerEventId = parsed ? deriveProviderEventId(parsed.event, parsed.data, bodySha256) : bodySha256;

      const { event: stored, inserted } = await repos.events.recordIfNew({
        providerEventId,
        eventType: payload.event,
        rawPayload: payload,
        signatureValid: true,
      });

      if (inserted) {
        await emit.publish(systemContext(ctx.requestId), "webhook.received", { providerEventId, eventType: payload.event, signatureValid: true });
      } else if (!needsProcessing(stored)) {
        return ok({ outcome: "duplicate" });
      }

      return ok({ outcome: await processStored(ctx, stored) });
    } catch (err) {
      log.error("webhook.receive_failed", { kind: thrownKind(err) });
      // The route answers 500 and the provider retries. If the event was already stored, the retry finds it unfinished and runs it again.
      return failFromThrown(err, ctx.requestId);
    }
  }

  async function reprocessPending(ctx: RequestContext, opts?: { maxEvents?: number }): Promise<Result<{ examined: number; processed: number; deferred: number; errored: number }>> {
    const max = Math.min(Math.max(opts?.maxEvents ?? MAX_SWEEP_EVENTS, 1), MAX_SWEEP_EVENTS);
    const counts = { examined: 0, processed: 0, deferred: 0, errored: 0 };
    try {
      let cursor: string | null = null;
      while (counts.examined < max) {
        const page = await repos.events.listUnprocessed({ limit: Math.min(SWEEP_PAGE, max - counts.examined), cursor });
        for (const stored of page.items) {
          if (counts.examined >= max) break;
          counts.examined += 1;
          const outcome = await processStored(ctx, stored);
          if (outcome === "processed") counts.processed += 1;
          else if (outcome === "deferred") counts.deferred += 1;
          else counts.errored += 1;
        }
        cursor = page.nextCursor;
        if (cursor === null) break;
      }
      return ok(counts);
    } catch (err) {
      log.error("webhook.sweep_failed", { kind: thrownKind(err) });
      return failFromThrown(err, ctx.requestId);
    }
  }

  return { receive, reprocessPending };
}
