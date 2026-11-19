import "server-only";
import { headers } from "next/headers";
import type { RequestContext } from "@/contracts/services";

/** Builds the correlation context every service call carries. The actor id is filled in by the service after it reads the session. */
export async function buildRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    requestId: h.get("x-request-id") ?? crypto.randomUUID(),
    actorId: null,
    ip: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: h.get("user-agent"),
  };
}
