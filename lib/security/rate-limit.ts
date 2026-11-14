import { createHmac } from "node:crypto";
import { AppError, type ErrorCode, type Result } from "@/contracts/errors";
import type { RateLimitRepository } from "@/contracts/repositories";
import type { RateLimiter, RateLimitRule, RequestContext, SecurityEventService } from "@/contracts/services";
import type { SecurityLogger } from "./types";

export interface RateLimiterDeps {
  limits: RateLimitRepository;
  events: SecurityEventService;
  /** Secret for hashing addresses and ids in counter keys (env RATE_LIMIT_HMAC_SECRET). At least 32 characters. */
  hmacSecret: string;
  logger: SecurityLogger;
}

const MIN_SECRET_LENGTH = 32;

function fail<T>(code: ErrorCode, ctx: RequestContext): Result<T> {
  return { ok: false, error: new AppError(code, { reference: ctx.requestId }).toShape() };
}

function validRule(rule: RateLimitRule): boolean {
  return rule.name.length > 0 && Number.isInteger(rule.limit) && rule.limit >= 1 && Number.isInteger(rule.windowSeconds) && rule.windowSeconds >= 1;
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  if (deps.hmacSecret.length < MIN_SECRET_LENGTH) {
    throw new Error("RATE_LIMIT_HMAC_SECRET must be at least 32 characters");
  }

  const digest = (value: string): string => createHmac("sha256", deps.hmacSecret).update(value).digest("hex").slice(0, 32);

  return {
    async check(ctx, rule, opts) {
      if (!validRule(rule)) {
        deps.logger.error("rate_limit_bad_rule", { requestId: ctx.requestId, rule: rule.name });
        return fail("INTERNAL", ctx);
      }

      const scopes: { scope: "ip" | "account"; key: string }[] = [
        { scope: "ip", key: `${rule.name}:ip:${digest((ctx.ip ?? "unknown").trim().toLowerCase())}` },
      ];
      if (opts?.memberId) scopes.push({ scope: "account", key: `${rule.name}:acct:${digest(opts.memberId)}` });

      let counts: number[];
      try {
        // Always count every scope, so a blocked caller still uses up the other counter.
        const hits = await Promise.all(scopes.map((s) => deps.limits.hit(s.key, rule.windowSeconds)));
        counts = hits.map((h) => h.count);
      } catch (err) {
        deps.logger.error("rate_limit_store_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
        return fail("SYSTEM_UNAVAILABLE", ctx);
      }

      const highest = Math.max(...counts);
      if (highest <= rule.limit) return { ok: true, value: { remaining: rule.limit - highest } };

      // One event per scope per window (the first blocked hit), so an attack cannot flood the event table.
      for (let i = 0; i < scopes.length; i++) {
        if (counts[i] === rule.limit + 1) {
          try {
            await deps.events.record(ctx, { type: "rate_limited", severity: "low", memberId: opts?.memberId ?? null, detail: { rule: rule.name, scope: scopes[i].scope } });
          } catch (err) {
            deps.logger.error("rate_limit_event_failed", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
          }
        }
      }
      return fail("RATE_LIMITED", ctx);
    },
  };
}
