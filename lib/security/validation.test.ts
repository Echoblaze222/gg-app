// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody } from "./validation";

const schema = z.object({ email: z.email(), amount: z.number().int().positive() });
const req = (body: BodyInit | null, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://example.test/api", { method: "POST", body, headers });

describe("parseBody", () => {
  it("returns parsed data for valid JSON", async () => {
    const r = await parseBody(req(JSON.stringify({ email: "a@b.co", amount: 5 })), schema, { maxBytes: 1024, requestId: "r1" });
    expect(r).toEqual({ ok: true, value: { email: "a@b.co", amount: 5 } });
  });
  it("strips unknown fields (object schema default)", async () => {
    const r = await parseBody(req(JSON.stringify({ email: "a@b.co", amount: 5, isAdmin: true })), schema, { maxBytes: 1024, requestId: "r1" });
    expect(r.ok && "isAdmin" in r.value).toBe(false);
  });
  it("rejects a body over the cap even without a content-length header", async () => {
    const big = JSON.stringify({ email: "a@b.co", amount: 5, pad: "x".repeat(5000) });
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const r = await parseBody(new Request("https://example.test/api", { method: "POST", body: stream, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit), schema, { maxBytes: 1024, requestId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
  it("rejects a declared content-length over the cap before reading", async () => {
    const r = await parseBody(req("{}", { "content-type": "application/json", "content-length": "999999" }), schema, { maxBytes: 1024, requestId: "r1" });
    expect(!r.ok && r.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
  it("rejects a non JSON content type", async () => {
    const r = await parseBody(req("a=b", { "content-type": "text/plain" }), schema, { maxBytes: 1024, requestId: "r1" });
    expect(!r.ok && r.error.code).toBe("VALIDATION_FAILED");
  });
  it("rejects malformed JSON", async () => {
    const r = await parseBody(req("{not json"), schema, { maxBytes: 1024, requestId: "r1" });
    expect(!r.ok && r.error.code).toBe("VALIDATION_FAILED");
  });
  it("returns field names but never echoes submitted values", async () => {
    const r = await parseBody(req(JSON.stringify({ email: "super-secret-value", amount: -1 })), schema, { maxBytes: 1024, requestId: "r1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.error.fields ?? {}).sort()).toEqual(["amount", "email"]);
      expect(JSON.stringify(r.error)).not.toContain("super-secret-value");
      expect(r.error.reference).toBe("r1");
    }
  });
  it("does not let __proto__ in the body pollute objects", async () => {
    const r = await parseBody(req('{"email":"a@b.co","amount":5,"__proto__":{"isAdmin":true}}'), schema, { maxBytes: 1024, requestId: "r1" });
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(r.ok && (r.value as Record<string, unknown>).isAdmin).toBeFalsy();
  });
  it("rejects an empty body", async () => {
    const r = await parseBody(req(null), schema, { maxBytes: 1024, requestId: "r1" });
    expect(!r.ok && r.error.code).toBe("VALIDATION_FAILED");
  });
});
