import { describe, expect, it, vi } from "vitest";
import type { Member, Page } from "../../contracts/entities";
import { AppError, type ErrorCode, type Result } from "../../contracts/errors";
import type { RequestContext } from "../../contracts/services";
import type { AdminMemberService } from "../../contracts/v1_1";
import { MEMBERS_PAGE_SIZE, loadAdminMembersPage, membersHref } from "./members-page";

// All fakes live in this test file only. Nothing here is imported by production code.

const ctx: RequestContext = { requestId: "req-1", actorId: null, ip: null, userAgent: null };

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    email: `${id}@example.test`,
    phone: "+2348012345678",
    fullName: `Member ${id}`,
    status: "active",
    roles: ["member", "admin"],
    emailVerifiedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  } as Member;
}

function failure(code: ErrorCode, fields?: Record<string, string>): Result<never> {
  return { ok: false, error: new AppError(code, { reference: "req-1", fields }).toShape() };
}

function setup(result?: Result<Page<Member>>) {
  const list = vi.fn(async (_ctx: RequestContext, _input: { status?: string; search?: string }, _page: { limit: number; cursor?: string | null }): Promise<Result<Page<Member>>> => result ?? { ok: true, value: { items: [member("a"), member("b", { status: "suspended" })], nextCursor: "next-1" } });
  const members = { list, get: vi.fn(), setStatus: vi.fn() } as unknown as AdminMemberService;
  return { members, list };
}

describe("loadAdminMembersPage", () => {
  it("returns plain rows with only the fields the list shows", async () => {
    const s = setup();
    const state = await loadAdminMembersPage({ members: s.members, ctx }, {});
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") {
      return;
    }
    expect(state.nextCursor).toBe("next-1");
    expect(state.rows).toHaveLength(2);
    const first = state.rows[0];
    expect(first).toEqual(expect.objectContaining({ id: "a", name: "Member a", email: "a@example.test", status: "active" }));
    expect(Object.keys(first ?? {}).sort()).toEqual(["email", "id", "joined", "name", "status"]);
    expect(JSON.stringify(state)).not.toContain("+2348012345678");
    expect(state.rows[1]?.status).toBe("suspended");
  });

  it("formats the join date in Lagos time and survives a bad date", async () => {
    const s = setup({ ok: true, value: { items: [member("a", { createdAt: "2026-11-01T23:30:00.000Z" }), member("b", { createdAt: "not a date" })], nextCursor: null } });
    const state = await loadAdminMembersPage({ members: s.members, ctx }, {});
    if (state.kind !== "ready") {
      throw new Error("expected ready");
    }
    // 23:30 UTC on 1 November is already 2 November in Lagos (UTC+1).
    expect(state.rows[0]?.joined).toContain("2");
    expect(state.rows[0]?.joined).toContain("Nov");
    expect(state.rows[0]?.joined).toContain("2026");
    expect(state.rows[1]?.joined).toBe("Unknown");
  });

  it("passes the filters and the cursor to the service with the page size", async () => {
    const s = setup();
    await loadAdminMembersPage({ members: s.members, ctx }, { status: "suspended", search: "ada", cursor: "abc" });
    expect(s.list).toHaveBeenCalledWith(ctx, { status: "suspended", search: "ada" }, { limit: MEMBERS_PAGE_SIZE, cursor: "abc" });
  });

  it("leaves empty values out of the request", async () => {
    const s = setup();
    await loadAdminMembersPage({ members: s.members, ctx }, { status: "", search: "", cursor: "" });
    expect(s.list).toHaveBeenCalledWith(ctx, {}, { limit: MEMBERS_PAGE_SIZE, cursor: null });
  });

  it("returns the field messages when a filter is not acceptable", async () => {
    const s = setup(failure("VALIDATION_FAILED", { search: "Use at most 100 characters." }));
    const state = await loadAdminMembersPage({ members: s.members, ctx }, { search: "x".repeat(101) });
    expect(state).toEqual({ kind: "invalid", fields: { search: "Use at most 100 characters." } });
  });

  it("returns an empty field map when validation failed without field detail", async () => {
    const s = setup(failure("VALIDATION_FAILED"));
    const state = await loadAdminMembersPage({ members: s.members, ctx }, {});
    expect(state).toEqual({ kind: "invalid", fields: {} });
  });

  it.each([
    ["AUTH_SESSION_EXPIRED", { kind: "redirect", to: "/login" }],
    ["AUTH_MFA_REQUIRED", { kind: "redirect", to: "/mfa" }],
  ] as const)("sends the browser away on %s", async (code, expected) => {
    const s = setup(failure(code));
    expect(await loadAdminMembersPage({ members: s.members, ctx }, {})).toEqual(expected);
  });

  it.each([["PERMISSION_DENIED"], ["AUTH_ACCOUNT_SUSPENDED"], ["AUTH_EMAIL_NOT_VERIFIED"]] as const)("blocks on %s", async (code) => {
    const s = setup(failure(code));
    const state = await loadAdminMembersPage({ members: s.members, ctx }, {});
    expect(state).toEqual(expect.objectContaining({ kind: "blocked", error: expect.objectContaining({ code }) }));
  });

  it.each([["SYSTEM_UNAVAILABLE"], ["INTERNAL"]] as const)("reports %s as a failure", async (code) => {
    const s = setup(failure(code));
    const state = await loadAdminMembersPage({ members: s.members, ctx }, {});
    expect(state).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code }) }));
  });

  it("fails with SYSTEM_UNAVAILABLE and the reference when the service could not be built", async () => {
    const state = await loadAdminMembersPage({ members: null, ctx }, {});
    expect(state).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code: "SYSTEM_UNAVAILABLE", reference: "req-1" }) }));
  });

  it("turns an unexpected throw into INTERNAL with the reference, reports it, and leaks nothing", async () => {
    const s = setup();
    s.list.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const onUnexpectedError = vi.fn();
    const state = await loadAdminMembersPage({ members: s.members, ctx, onUnexpectedError }, {});
    expect(state).toEqual(expect.objectContaining({ kind: "failed", error: expect.objectContaining({ code: "INTERNAL", reference: "req-1" }) }));
    expect(JSON.stringify(state)).not.toContain("hunter2");
    expect(onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("maps a thrown AppError like a returned one and does not report it as unexpected", async () => {
    const s = setup();
    s.list.mockRejectedValueOnce(new AppError("PERMISSION_DENIED", { reference: "req-1" }));
    const onUnexpectedError = vi.fn();
    const state = await loadAdminMembersPage({ members: s.members, ctx, onUnexpectedError }, {});
    expect(state).toEqual(expect.objectContaining({ kind: "blocked" }));
    expect(onUnexpectedError).not.toHaveBeenCalled();
  });
});

describe("membersHref", () => {
  it("returns the bare path with no filters", () => {
    expect(membersHref({})).toBe("/admin/members");
    expect(membersHref({ status: "", search: "", cursor: "" })).toBe("/admin/members");
  });

  it("keeps every filter and names the search term q", () => {
    expect(membersHref({ status: "active", search: "ada", cursor: "c1" })).toBe("/admin/members?status=active&q=ada&cursor=c1");
  });

  it("encodes characters that would change the address", () => {
    const href = membersHref({ search: "a&b=c d" });
    expect(href).toBe("/admin/members?q=a%26b%3Dc+d");
    expect(new URL(href, "https://example.test").searchParams.get("q")).toBe("a&b=c d");
  });
});
