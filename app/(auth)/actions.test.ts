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
};
vi.mock("./auth-gateway", () => ({
  getAuthService: () => gateway.service,
  getCurrentPolicyVersionIds: async () => gateway.policies,
  buildRequestContext: async () => ({ requestId: "req-test", actorId: null, ip: null, userAgent: null }),
}));

const { loginAction, registerAction } = await import("./actions");

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

const fakeAuth = (overrides: Partial<AuthService>): AuthService => overrides as AuthService;

beforeEach(() => {
  gateway.service = null;
  gateway.policies = [];
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
