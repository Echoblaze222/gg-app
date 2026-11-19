import { describe, expect, it } from "vitest";
import { AppError } from "@/contracts/errors";
import type { PermissionName } from "@/contracts/permissions";
import type { AuthorizationService, RequestContext, SessionInfo } from "@/contracts/services";
import { resolveAccess } from "./access";

const ctx: RequestContext = { requestId: "req-1", actorId: null, ip: null, userAgent: null };
const session = { memberId: "m1" } as unknown as SessionInfo;

function authz(rule: (p: PermissionName) => "ok" | AppError | "throw"): AuthorizationService {
  return {
    requirePermission: async (_c: RequestContext, p: PermissionName) => {
      const r = rule(p);
      if (r === "throw") throw new Error("boom");
      return r === "ok" ? { ok: true as const, value: session } : { ok: false as const, error: r.toShape() };
    },
  } as unknown as AuthorizationService;
}

describe("resolveAccess", () => {
  it("grants when the required permission passes and lists the optional ones that pass", async () => {
    const a = await resolveAccess(authz((p) => (p === "admin.audit.read" ? new AppError("PERMISSION_DENIED", { reference: "r" }) : "ok")), ctx, "member.history.read", ["admin.audit.read", "admin.payments.read"]);
    expect(a.kind).toBe("granted");
    if (a.kind === "granted") expect([...a.allowed].sort()).toEqual(["admin.payments.read", "member.history.read"]);
  });
  it("sends an expired session or missing MFA to sign in, not to a forbidden page", async () => {
    for (const code of ["AUTH_SESSION_EXPIRED", "AUTH_MFA_REQUIRED"] as const) {
      const a = await resolveAccess(authz(() => new AppError(code, { reference: "r" })), ctx, "member.history.read");
      expect(a.kind).toBe("sign_in");
    }
  });
  it("denies a missing permission", async () => {
    const a = await resolveAccess(authz(() => new AppError("PERMISSION_DENIED", { reference: "r" })), ctx, "member.history.read");
    expect(a.kind).toBe("denied");
  });
  it("treats a throwing authorization service as denied with a reference, never as granted", async () => {
    const a = await resolveAccess(authz(() => "throw"), ctx, "member.history.read");
    expect(a.kind).toBe("denied");
    if (a.kind === "denied") expect(a.error.reference).toBe("req-1");
  });
});
