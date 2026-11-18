// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDeviceGate, type DeviceDb } from "./device-gate";
import { IdentityProviderError } from "./supabase-identity";
import { MEMBER_ID } from "@/tests/security/fakes";
import { SECRET_TEXT } from "@/tests/security/supabase-fake";

const gate = (find: DeviceDb["find"]) => createDeviceGate({ db: { find } });

describe("device gate", () => {
  it("a revoked device is revoked", async () => {
    expect(await gate(async () => ({ data: { revoked_at: "2026-11-17T09:00:00Z" }, error: null })).isRevoked(MEMBER_ID, "sess-1")).toBe(true);
  });
  it("a device that is not revoked is not revoked", async () => {
    expect(await gate(async () => ({ data: { revoked_at: null }, error: null })).isRevoked(MEMBER_ID, "sess-1")).toBe(false);
  });
  it("a session with no device row yet is not revoked", async () => {
    expect(await gate(async () => ({ data: null, error: null })).isRevoked(MEMBER_ID, "sess-1")).toBe(false);
  });
  it("looks the row up by session id and member id", async () => {
    const seen: Array<[string, string]> = [];
    await gate(async (s, m) => { seen.push([s, m]); return { data: null, error: null }; }).isRevoked(MEMBER_ID, "sess-1");
    expect(seen).toEqual([["sess-1", MEMBER_ID]]);
  });
  it("a database error or failure throws, it never reads as not revoked", async () => {
    const a = await gate(async () => ({ data: null, error: { code: "XX000", message: SECRET_TEXT } })).isRevoked(MEMBER_ID, "s").then(() => null, (x: unknown) => x);
    expect(a).toBeInstanceOf(IdentityProviderError);
    const b = await gate(async () => { throw new Error(SECRET_TEXT); }).isRevoked(MEMBER_ID, "s").then(() => null, (x: unknown) => x);
    expect(b).toBeInstanceOf(IdentityProviderError);
    expect(JSON.stringify([a, b])).not.toContain(SECRET_TEXT);
  });
});
