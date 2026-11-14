import { AppError } from "@/contracts/errors";
import type { AuditRepository } from "@/contracts/repositories";
import type { AuditService, RequestContext } from "@/contracts/services";
import { redactDetail } from "./redact";
import type { SecurityLogger } from "./types";

type Entry = Parameters<AuditService["record"]>[1];

export interface StrictAuditService extends AuditService {
  /**
   * Same as record, but throws AppError("INTERNAL") if the row cannot be written.
   * Use for privileged actions so they fail closed when no audit trail can be kept.
   */
  recordStrict(ctx: RequestContext, entry: Entry): Promise<void>;
}

export function createAuditService(deps: { audit: AuditRepository; logger: SecurityLogger }): StrictAuditService {
  async function write(ctx: RequestContext, entry: Entry): Promise<void> {
    await deps.audit.record({
      actorId: ctx.actorId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      result: entry.result,
      ip: ctx.ip,
      requestId: ctx.requestId,
      detail: redactDetail(entry.detail),
    });
  }

  function logFailure(ctx: RequestContext, entry: Entry, err: unknown): void {
    // Only the error name is logged: messages from stores can echo submitted values.
    deps.logger.error("audit_write_failed", {
      requestId: ctx.requestId,
      action: entry.action,
      errorName: err instanceof Error ? err.name : "unknown",
    });
  }

  return {
    async record(ctx, entry) {
      try {
        await write(ctx, entry);
      } catch (err) {
        logFailure(ctx, entry, err);
      }
    },
    async recordStrict(ctx, entry) {
      try {
        await write(ctx, entry);
      } catch (err) {
        logFailure(ctx, entry, err);
        throw new AppError("INTERNAL", { reference: ctx.requestId, internal: "audit_write_failed" });
      }
    },
  };
}
