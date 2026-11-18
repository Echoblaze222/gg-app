import { describe, expect, it, vi } from "vitest";
import { exchangeOAuthCode, nextStepAfterGoogle, startGoogleOAuth } from "./flows";
import type { SbAuthExtras } from "./supabase-extras";

const asAuth = (o: object) => o as unknown as SbAuthExtras;

describe("google flow", () => {
  it("returns the provider address, and null when Google is off", async () => {
    const on = asAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: "https://accounts.example/o" }, error: null }) });
    expect(await startGoogleOAuth(on, { redirectTo: "https://app.example/auth/callback" })).toBe("https://accounts.example/o");
    const off = asAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: null }, error: { message: "provider is not enabled" } }) });
    expect(await startGoogleOAuth(off, { redirectTo: "https://app.example/auth/callback" })).toBeNull();
    const plain = asAuth({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: "http://insecure.example" }, error: null }) });
    expect(await startGoogleOAuth(plain, { redirectTo: "https://app.example/auth/callback" })).toBeNull();
  });

  it("refuses a malformed code without calling the provider", async () => {
    const exchange = vi.fn().mockResolvedValue({ data: { session: null, user: { id: "u" } }, error: null });
    expect(await exchangeOAuthCode(asAuth({ exchangeCodeForSession: exchange }), "bad code!")).toBe(false);
    expect(exchange).not.toHaveBeenCalled();
    expect(await exchangeOAuthCode(asAuth({ exchangeCodeForSession: exchange }), "3f1c2a9e-1111-4222-8333-444455556666")).toBe(true);
  });

  it("sends new Google members to the terms first, then to the second factor, then in", async () => {
    const yes = async () => true;
    const no = async () => false;
    expect(await nextStepAfterGoogle({ acceptedCurrentPolicies: no, verifiedTotpCount: async () => 1 })).toBe("/accept-terms");
    expect(await nextStepAfterGoogle({ acceptedCurrentPolicies: yes, verifiedTotpCount: async () => 1 })).toBe("/mfa");
    expect(await nextStepAfterGoogle({ acceptedCurrentPolicies: yes, verifiedTotpCount: async () => 0 })).toBe("/app");
  });
});
