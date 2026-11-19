import type { DomainEventMap, DomainEventName } from "@/contracts/events";
import type { RequestContext } from "@/contracts/services";
import type { Uuid } from "@/contracts/entities";
import type { NotificationType } from "@/contracts/enums";
import type { PaymentServiceDeps } from "./deps";

export function systemContext(requestId: string): RequestContext {
  return { requestId, actorId: null, ip: null, userAgent: null };
}

export interface Emitter {
  publish<N extends DomainEventName>(ctx: RequestContext, name: N, data: DomainEventMap[N]): Promise<void>;
  notify(ctx: RequestContext, input: { memberId: Uuid; type: NotificationType; title: string; body: string; link?: string }): Promise<void>;
}

/**
 * Events and notifications happen after state has committed. A failure here must never undo or fail
 * the money step that came before, so both swallow errors and log the event name only.
 */
export function createEmitter(deps: Pick<PaymentServiceDeps, "bus" | "notifications" | "log" | "now" | "newId">): Emitter {
  return {
    async publish(ctx, name, data) {
      try {
        await deps.bus.publish({ id: deps.newId(), name, occurredAt: deps.now().toISOString(), requestId: ctx.requestId, actorId: ctx.actorId, data });
      } catch {
        deps.log.warn("event.publish_failed", { name });
      }
    },
    async notify(ctx, input) {
      try {
        const result = await deps.notifications.notify(ctx, input);
        if (!result.ok) deps.log.warn("notification.rejected", { type: input.type, code: result.error.code });
      } catch {
        deps.log.warn("notification.failed", { type: input.type });
      }
    },
  };
}
