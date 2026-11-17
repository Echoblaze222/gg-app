import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { AuthService } from "@/contracts/services";
import { IDLE } from "./form-state";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

const gateway = {
  service: null as AuthService | null,
  policies: [] as string[],
  googleUrl: null as string | null,
};
vi.mock("./auth-gateway", () => ({
  getAuthService: () => gateway.service,
  getCurrentPolicyVersionIds: async () => gateway.policies,
  getGoogleAuthUrl: async () => gateway.googleUrl,
  buildRequestContext: async () => ({ requestId: "req-test", actorId: null, ip: null, userAgent: null }),
}));

const { loginAction, registerAction, googleAction, forgotPasswordAction, resetPasswordAction, mfaAction } = await import("./actions");

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

const fakeAuth = (overrides: Partial<AuthService>): AuthService => overrides as AuthService;

beforeEach(() => {
  gateway.service = null;
  gateway.policies = [];
  gateway.googleUrl = null;
  redirect.mockClear();
});

describe("loginAction", () => {
  it("returns field messages when the form is empty and does not call the server", async () => {
    const login = vi.fn();
    gateway.service = fakeAuth({ login });
    const s = await loginAction(IDLE, form({ identifier: "", password: "" }));
    expect(s).toMatchObject({ status: "error", fields: { identifier: expect.any(String), password: expect.any(String) } });
    expect(login).not.toHaveBeenCalled();
  });

  it("says the service is unavailable when no auth service is wired, with a reference", async () => {
    const s = await loginAction(IDLE, form({ identifier: "ada@example.com", password: "secret-password" }));
    expect(s).toMatchObject({ status: "error", reference: "req-test" });
    if (s.status === "error") expect(s.message).toMatch(/temporarily unavailable/i);
  });

  it("shows the server's error and never invents success", async () => {
    const error = new AppError("AUTH_INVALID_CREDENTIALS", { reference: "req-9" }).toShape();
    gateway.service = fakeAuth({ login: async () => ({ ok: false, error }) });
    const s = await loginAction(IDLE, form({ identifier: "ada@example.com", password: "wrong-password" }));
    expect(s).toMatchObject({ status: "error", reference: "req-9" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("goes to /app after a confirmed sign in and to /mfa when a code is needed", async () => {
    gateway.service = fakeAuth({ login: async () => ({ ok: true, value: { mfaRequired: false } }) });
    await expect(loginAction(IDLE, form({ identifier: "ada@example.com", password: "right-password" }))).rejects.toThrow("REDIRECT:/app");
    gateway.service = fakeAuth({ login: async () => ({ ok: true, value: { mfaRequired: true } }) });
    await expect(loginAction(IDLE, form({ identifier: "ada@example.com", password: "right-password" }))).rejects.toThrow("REDIRECT:/mfa");
  });

  it("counts attempts so the shake replays", async () => {
    const first = await loginAction(IDLE, form({ identifier: "", password: "" }));
    const second = await loginAction(first, form({ identifier: "", password: "" }));
    expect(first).toMatchObject({ attempt: 1 });
    expect(second).toMatchObject({ attempt: 2 });
  });
});

describe("registerAction", () => {
  const good = { fullName: "Ada Obi", email: "Ada@Example.com", phone: "08012345678", password: "a-long-password", acceptTerms: "on" };

  it("requires accepting the terms", async () => {
    const s = await registerAction(IDLE, form({ ...good, acceptTerms: "" }));
    expect(s).toMatchObject({ status: "error", fields: { acceptTerms: expect.any(String) } });
  });

  it("rejects a short password and a bad phone with readable messages", async () => {
    const s = await registerAction(IDLE, form({ ...good, password: "short", phone: "12345" }));
    expect(s).toMatchObject({ status: "error", fields: { password: expect.any(String), phone: expect.stringMatching(/Nigerian/) } });
  });

  it("takes the policy versions from the server, never from the form", async () => {
    const register = vi.fn(async () => ({ ok: true as const, value: { memberId: "m1", verificationSent: true } }));
    gateway.service = fakeAuth({ register });
    gateway.policies = ["11111111-1111-4111-8111-111111111111"];
    const data = form(good);
    data.set("acceptedPolicyVersionIds", "attacker-chosen");
    const s = await registerAction(IDLE, data);
    expect(s).toMatchObject({ status: "success" });
    expect(register).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ acceptedPolicyVersionIds: ["11111111-1111-4111-8111-111111111111"], email: "ada@example.com" }));
  });

  it("is unavailable, not successful, when no policy versions can be read", async () => {
    gateway.service = fakeAuth({ register: vi.fn() });
    const s = await registerAction(IDLE, form(good));
    expect(s).toMatchObject({ status: "error", reference: "req-test" });
  });
});

describe("googleAction", () => {
  it("says unavailable while Google sign in is not wired, and never redirects", async () => {
    const s = await googleAction(IDLE);
    expect(s).toMatchObject({ status: "error", reference: "req-test" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends the browser to the address the server built", async () => {
    gateway.googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";
    await expect(googleAction(IDLE)).rejects.toThrow("REDIRECT:https://accounts.google.com/o/oauth2/v2/auth?state=abc");
  });
});

describe("forgotPasswordAction", () => {
  it("asks for a valid email without calling the server", async () => {
    const requestPasswordReset = vi.fn();
    gateway.service = fakeAuth({ requestPasswordReset });
    const s = await forgotPasswordAction(IDLE, form({ email: "not-an-email" }));
    expect(s).toMatchObject({ status: "error", fields: { email: expect.any(String) } });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("gives the same wording for any valid email, so it cannot reveal who has an account", async () => {
    gateway.service = fakeAuth({ requestPasswordReset: async () => ({ ok: true, value: undefined }) });
    const s = await forgotPasswordAction(IDLE, form({ email: "Ada@Example.com" }));
    expect(s).toMatchObject({ status: "success", message: expect.stringContaining("If an account exists for ada@example.com") });
  });

  it("shows a rate limit instead of pretending it worked", async () => {
    const error = new AppError("RATE_LIMITED", { reference: "req-5" }).toShape();
    gateway.service = fakeAuth({ requestPasswordReset: async () => ({ ok: false, error }) });
    expect(await forgotPasswordAction(IDLE, form({ email: "ada@example.com" }))).toMatchObject({ status: "error", reference: "req-5" });
  });
});

describe("resetPasswordAction", () => {
  it("rejects a short password and a mismatched confirmation", async () => {
    gateway.service = fakeAuth({ resetPassword: vi.fn() });
    expect(await resetPasswordAction(IDLE, form({ token: "t", password: "short", confirm: "short" }))).toMatchObject({ fields: { password: expect.any(String) } });
    expect(await resetPasswordAction(IDLE, form({ token: "t", password: "a-long-password", confirm: "another-password" }))).toMatchObject({ fields: { confirm: "The passwords do not match." } });
  });

  it("passes the token to the server and reports success only when the server says so", async () => {
    const resetPassword = vi.fn(async () => ({ ok: true as const, value: undefined }));
    gateway.service = fakeAuth({ resetPassword });
    const s = await resetPasswordAction(IDLE, form({ token: "tok-123", password: "a-long-password", confirm: "a-long-password" }));
    expect(s).toMatchObject({ status: "success" });
    expect(resetPassword).toHaveBeenCalledWith(expect.anything(), { token: "tok-123", newPassword: "a-long-password" });
  });

  it("shows the server's expired link error", async () => {
    const error = new AppError("AUTH_RESET_LINK_INVALID", { reference: "req-8" }).toShape();
    gateway.service = fakeAuth({ resetPassword: async () => ({ ok: false, error }) });
    const s = await resetPasswordAction(IDLE, form({ token: "old", password: "a-long-password", confirm: "a-long-password" }));
    expect(s).toMatchObject({ status: "error", reference: "req-8" });
  });
});

describe("mfaAction", () => {
  it("needs exactly six digits and ignores spaces", async () => {
    const verifyMfa = vi.fn(async () => ({ ok: true as const, value: undefined }));
    gateway.service = fakeAuth({ verifyMfa });
    expect(await mfaAction(IDLE, form({ code: "12345" }))).toMatchObject({ status: "error", fields: { code: expect.any(String) } });
    await expect(mfaAction(IDLE, form({ code: "123 456" }))).rejects.toThrow("REDIRECT:/app");
    expect(verifyMfa).toHaveBeenCalledWith(expect.anything(), { code: "123456" });
  });

  it("stays on the page with the server's message when the code is wrong", async () => {
    const error = new AppError("AUTH_MFA_INVALID", { reference: "req-3" }).toShape();
    gateway.service = fakeAuth({ verifyMfa: async () => ({ ok: false, error }) });
    expect(await mfaAction(IDLE, form({ code: "000000" }))).toMatchObject({ status: "error", reference: "req-3" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
