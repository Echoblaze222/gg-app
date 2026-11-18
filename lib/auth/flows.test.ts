import { describe, expect, it, vi } from "vitest";
import { confirmEmailToken, confirmTotpEnrolment, startTotpEnrolment } from "./flows";
import type { SbAuthExtras } from "./supabase-extras";

function fake(overrides: Partial<Omit<SbAuthExtras, "mfa">> & { mfa?: Partial<SbAuthExtras["mfa"]> } = {}) {
  const auth = {
    verifyOtp: vi.fn().mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
    mfa: {
      enroll: vi.fn().mockResolvedValue({ data: { id: "f2", type: "totp", totp: { qr_code: "<svg/>", secret: "SECRET", uri: "otpauth://x" } }, error: null }),
      challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: null }),
      unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
      listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }),
      ...overrides.mfa,
    },
  };
  return auth as unknown as SbAuthExtras & typeof auth;
}

describe("confirmEmailToken", () => {
  it("confirms and ends the session the link opened", async () => {
    const auth = fake();
    expect(await confirmEmailToken(auth, { tokenHash: "pkce_abcdef123456", type: "email" })).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects bad input without calling the provider", async () => {
    const auth = fake();
    expect(await confirmEmailToken(auth, { tokenHash: "short", type: "email" })).toBe(false);
    expect(await confirmEmailToken(auth, { tokenHash: "abcdefgh12345678", type: "recovery" })).toBe(false);
    expect(await confirmEmailToken(auth, { tokenHash: "abc def 123456789", type: "signup" })).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("fails when the provider refuses, and keeps no session step", async () => {
    const auth = fake({ verifyOtp: vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: { message: "expired" } }) });
    expect(await confirmEmailToken(auth, { tokenHash: "abcdefgh12345678", type: "signup" })).toBe(false);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("totp enrolment", () => {
  it("removes an abandoned factor before enrolling again", async () => {
    const auth = fake({ mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [{ id: "old", status: "unverified" }, { id: "keep", status: "verified" }] }, error: null }) } });
    const result = await startTotpEnrolment(auth);
    expect(result).toEqual({ factorId: "f2", secret: "SECRET", uri: "otpauth://x", qrSvg: "<svg/>" });
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "old" });
  });

  it("returns null when the provider fails", async () => {
    const auth = fake({ mfa: { enroll: vi.fn().mockResolvedValue({ data: null, error: { message: "x" } }) } });
    expect(await startTotpEnrolment(auth)).toBeNull();
  });

  it("reports whether the first code was accepted", async () => {
    expect(await confirmTotpEnrolment(fake(), { factorId: "f2", code: "123456" })).toBe(true);
    const bad = fake({ mfa: { challengeAndVerify: vi.fn().mockResolvedValue({ data: null, error: { message: "bad" } }) } });
    expect(await confirmTotpEnrolment(bad, { factorId: "f2", code: "000000" })).toBe(false);
  });
});
