// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createAuditService } from "./audit";
import { fakeAuditRepo, fakeLogger, makeCtx } from "@/tests/security/fakes";

describe("audit service", () => {
  it("writes actor, request id, ip and result", async () => {
    const repo = fakeAuditRepo();
    const svc = createAuditService({ audit: repo, logger: fakeLogger() });
    await svc.record(makeCtx(), { action: "role.grant", targetType: "member", targetId: "m1", result: "success" });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ actorId: makeCtx().actorId, action: "role.grant", result: "success", requestId: "req_test_1", ip: "203.0.113.9" });
  });
  it("redacts secret looking keys at any depth", async () => {
    const repo = fakeAuditRepo();
    const svc = createAuditService({ audit: repo, logger: fakeLogger() });
    await svc.record(makeCtx(), { action: "x", result: "success", detail: { password: "p", nested: { access_token: "t", ok: 1, list: [{ cardNumber: "4111" }] }, Authorization: "Bearer z" } });
    const text = JSON.stringify(repo.rows[0].detail);
    expect(text).not.toContain('"p"');
    expect(text).not.toContain("Bearer z");
    expect(text).not.toContain("4111");
    expect(text).toContain('"ok":1');
  });
  it("caps oversized detail", async () => {
    const repo = fakeAuditRepo();
    const svc = createAuditService({ audit: repo, logger: fakeLogger() });
    await svc.record(makeCtx(), { action: "x", result: "success", detail: { blob: "y".repeat(50_000) } });
    expect(JSON.stringify(repo.rows[0].detail).length).toBeLessThan(9_000);
  });
  it("record never throws when the write fails, and logs it", async () => {
    const logger = fakeLogger();
    const svc = createAuditService({ audit: fakeAuditRepo({ fail: true }), logger });
    await expect(svc.record(makeCtx(), { action: "x", result: "success" })).resolves.toBeUndefined();
    expect(logger.errors).toHaveLength(1);
  });
  it("recordStrict throws INTERNAL when the write fails (fail closed)", async () => {
    const svc = createAuditService({ audit: fakeAuditRepo({ fail: true }), logger: fakeLogger() });
    await expect(svc.recordStrict(makeCtx(), { action: "role.grant", result: "success" })).rejects.toMatchObject({ code: "INTERNAL", reference: "req_test_1" });
  });
  it("logged failure does not contain the audit detail", async () => {
    const logger = fakeLogger();
    const svc = createAuditService({ audit: fakeAuditRepo({ fail: true }), logger });
    await svc.record(makeCtx(), { action: "x", result: "success", detail: { password: "hunter2" } });
    expect(JSON.stringify(logger.errors)).not.toContain("hunter2");
  });
});
