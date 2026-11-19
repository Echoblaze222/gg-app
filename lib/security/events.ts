import type { SecurityEventRepository } from "@/contracts/repositories";
import type { RequestContext, SecurityEventService } from "@/contracts/services";
import { redactDetail } from "./redact";
import type { SecurityLogger } from "./types";

/** Writes security events through the repository. Detail is redacted first. Failures propagate: callers decide whether to swallow them. */
export function createSecurityEventService(deps: { events: SecurityEventRepository; logger: SecurityLogger }): SecurityEventService {
  return {
    async record(ctx: RequestContext, event) {
      await deps.events.record({
        type: event.type,
        severity: event.severity,
        memberId: event.memberId ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        detail: redactDetail(event.detail),
      });
    },
  };
}
