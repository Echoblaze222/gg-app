import { describe, expect, it, vi } from "vitest";
import type { Announcement, Member } from "../../contracts/entities";
import { AppError, type AppErrorShape, type Result } from "../../contracts/errors";
import type { Repositories, RepositoryProvider } from "../../contracts/repositories";
import type { AuditService, AuthorizationService, RequestContext, SessionInfo } from "../../contracts/services";
import { ANNOUNCEMENT_EXCERPT_MAX, announcementLink, buildExcerpt } from "./announcement-schemas";
import { createAnnouncementService, type AnnouncementFanoutPorts, type AnnouncementFanoutState } from "./announcements";
import { deepLinkSchema } from "./schemas";

// All fakes live in this test file only. Nothing here is imported by production code.

const ADMIN = "11111111-1111-4111-8111-111111111111";
const ANN_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const PUBLISHED_AT = "2026-11-16T12:00:00.000Z";

function memberId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

const ctx: RequestContext = { requestId: "req-1", actorId: ADMIN, ip: null, userAgent: null };
const session: SessionInfo = { memberId: ADMIN, roles: ["admin"], recentlyReauthenticated: true, mfaVerified: true };

const draft: Announcement = {
  id: ANN_ID,
  title: "Scheduled maintenance",
  body: "Payments pause for ten minutes on Sunday night.",
  publishedAt: null,
  createdBy: ADMIN,
  createdAt: "2026-11-16T10:00:00.000Z",
};

function denied(code: "PERMISSION_DENIED" | "AUTH_REAUTH_REQUIRED"): Result<SessionInfo> {
  const shape: AppErrorShape = new AppError(code, { reference: "req-1" }).toShape();
  return { ok: false, error: shape };
}

function fakePorts(announcement: Announcement = draft) {
  const state = { cursor: null as string | null, completedAt: null as string | null, published: announcement.publishedAt !== null };
  const delivered = new Map<string, { announcementId: string; memberId: string; title: string; body: string; link: string }>();
  const failFor = new Set<string>();
  const stored = (): Announcement => ({ ...announcement, publishedAt: state.published ? PUBLISHED_AT : null });
  const ports = {
    getState: vi.fn(async (id: string): Promise<AnnouncementFanoutState | null> =>
      id === announcement.id ? { announcement: stored(), fanoutCursor: state.cursor, fanoutCompletedAt: state.completedAt } : null,
    ),
    ensurePublished: vi.fn(async (): Promise<Announcement> => {
      state.published = true;
      return stored();
    }),
    saveProgress: vi.fn(async (_id: string, cursor: string | null): Promise<void> => {
      state.cursor = cursor;
    }),
    completeFanout: vi.fn(async (): Promise<void> => {
      state.completedAt = PUBLISHED_AT;
    }),
    notifyIfAbsent: vi.fn(async (input: { announcementId: string; memberId: string; title: string; body: string; link: string }): Promise<{ created: boolean }> => {
      if (failFor.has(input.memberId)) {
        throw new Error("db down password=hunter2");
      }
      const key = `${input.announcementId}:${input.memberId}`;
      if (delivered.has(key)) {
        return { created: false };
      }
      delivered.set(key, input);
      return { created: true };
    }),
  } satisfies AnnouncementFanoutPorts;
  return { ports, state, delivered, failFor };
}

function harness(opts: { auth?: Result<SessionInfo>; memberCount?: number; ports?: ReturnType<typeof fakePorts> | null; batchSize?: number; maxBatchesPerCall?: number } = {}) {
  const allMembers = Array.from({ length: opts.memberCount ?? 5 }, (_, i) => ({ id: memberId(i + 1) }) as Member);
  const membersList = vi.fn(async (_filter: { status?: string }, page: { limit: number; cursor?: string | null }) => {
    const start = page.cursor ? Number(page.cursor) : 0;
    const items = allMembers.slice(start, start + page.limit);
    const next = start + page.limit < allMembers.length ? String(start + page.limit) : null;
    return { items, nextCursor: next };
  });
  const announcementsCreate = vi.fn(async (input: { title: string; body: string; createdBy: string }): Promise<Announcement> => ({
    id: ANN_ID,
    title: input.title,
    body: input.body,
    publishedAt: null,
    createdBy: input.createdBy,
    createdAt: "2026-11-16T10:00:00.000Z",
  }));
  const listPublished = vi.fn(async () => ({ items: [draft], nextCursor: null }));
  const server = vi.fn(() => ({ announcements: { create: announcementsCreate }, members: { list: membersList } }) as unknown as Repositories);
  const forSession = vi.fn(async () => ({ announcements: { listPublished } }) as unknown as Repositories);
  const provider: RepositoryProvider = { server, forSession };
  const requirePermission = vi.fn(async () => opts.auth ?? ({ ok: true, value: session } as Result<SessionInfo>));
  const authorization = { requirePermission } as unknown as AuthorizationService;
  const record = vi.fn(async () => undefined);
  const audit = { record } as unknown as AuditService;
  const fake = opts.ports === null ? undefined : (opts.ports ?? fakePorts());
  const onFanoutError = vi.fn();
  const onUnexpectedError = vi.fn();
  const service = createAnnouncementService({
    repositories: provider,
    authorization,
    audit,
    fanout: fake?.ports,
    batchSize: opts.batchSize ?? 2,
    maxBatchesPerCall: opts.maxBatchesPerCall,
    concurrency: 2,
    onFanoutError,
    onUnexpectedError,
  });
  return { service, fake, server, forSession, membersList, announcementsCreate, listPublished, requirePermission, record, onFanoutError, onUnexpectedError };
}

describe("create", () => {
  it("stores a draft with the author taken from the session, and audits it", async () => {
    const h = harness();
    const result = await h.service.create(ctx, { title: "  Scheduled maintenance ", body: "Payments pause on Sunday." });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "admin.announcements.manage");
    expect(h.announcementsCreate).toHaveBeenCalledWith({ title: "Scheduled maintenance", body: "Payments pause on Sunday.", createdBy: ADMIN });
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "announcement.create", targetId: ANN_ID, result: "success" }));
  });

  it("does not touch the repositories when permission is denied", async () => {
    const h = harness({ auth: denied("PERMISSION_DENIED") });
    const result = await h.service.create(ctx, { title: "Hello", body: "World" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
    }
    expect(h.server).not.toHaveBeenCalled();
  });

  it.each([
    ["empty title", { title: "   ", body: "Text" }, "title"],
    ["empty body", { title: "Title", body: "" }, "body"],
    ["title over 120", { title: "x".repeat(121), body: "Text" }, "title"],
    ["body over 2000", { title: "Title", body: "x".repeat(2001) }, "body"],
    ["line break in title", { title: "Line one\nLine two", body: "Text" }, "title"],
    ["NUL in body", { title: "Title", body: "Text\u0000more" }, "body"],
    ["bidi override in title", { title: "Pay \u202Eelpmaxe", body: "Text" }, "title"],
    ["bidi isolate in body", { title: "Title", body: "Text \u2066hidden" }, "body"],
    ["C1 control in body", { title: "Title", body: "Text\u0085more" }, "body"],
  ])("rejects %s and stores nothing", async (_label, input, field) => {
    const h = harness();
    const result = await h.service.create(ctx, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.fields?.[field]).toBeDefined();
    }
    expect(h.announcementsCreate).not.toHaveBeenCalled();
  });

  it("allows line breaks in the body", async () => {
    const h = harness();
    const result = await h.service.create(ctx, { title: "Title", body: "Line one\nLine two" });
    expect(result.ok).toBe(true);
  });

  it("still succeeds when the audit write fails, and reports it", async () => {
    const h = harness();
    h.record.mockRejectedValueOnce(new Error("audit down"));
    const result = await h.service.create(ctx, { title: "Title", body: "Text" });
    expect(result.ok).toBe(true);
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("publish", () => {
  it("asks for reauthentication and blocks before any fan out when it is missing", async () => {
    const h = harness({ auth: denied("AUTH_REAUTH_REQUIRED") });
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUTH_REAUTH_REQUIRED");
    }
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "admin.announcements.manage", { requireReauth: true });
    expect(h.fake?.ports.getState).not.toHaveBeenCalled();
    expect(h.server).not.toHaveBeenCalled();
  });

  it("rejects an id that is not a uuid", async () => {
    const h = harness();
    const result = await h.service.publish(ctx, { announcementId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
    expect(h.fake?.ports.getState).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown announcement and sends nothing", async () => {
    const h = harness();
    const result = await h.service.publish(ctx, { announcementId: OTHER_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(h.fake?.ports.ensurePublished).not.toHaveBeenCalled();
    expect(h.fake?.ports.notifyIfAbsent).not.toHaveBeenCalled();
  });

  it("fails closed when the fan out ports are not wired, and publishes nothing", async () => {
    const h = harness({ ports: null });
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SYSTEM_UNAVAILABLE");
    }
    expect(h.membersList).not.toHaveBeenCalled();
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });

  it("notifies every active member once, with a server built link and a short excerpt, and audits the counts", async () => {
    const h = harness();
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.publishedAt).toBe(PUBLISHED_AT);
    }
    expect(h.membersList).toHaveBeenCalled();
    for (const call of h.membersList.mock.calls) {
      expect(call[0]).toEqual({ status: "active" });
    }
    expect(h.fake?.delivered.size).toBe(5);
    for (const entry of h.fake?.delivered.values() ?? []) {
      expect(entry.link).toBe(`/app/announcements/${ANN_ID}`);
      expect(entry.title).toBe(draft.title);
      expect(entry.body).toBe(draft.body);
    }
    expect(h.fake?.ports.saveProgress).toHaveBeenLastCalledWith(ANN_ID, null);
    expect(h.fake?.ports.completeFanout).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "announcement.publish", detail: { created: 5, alreadyDelivered: 0 } }));
  });

  it("is a no op the second time and does not read members or notify again", async () => {
    const h = harness();
    await h.service.publish(ctx, { announcementId: ANN_ID });
    const listCalls = h.membersList.mock.calls.length;
    const notifyCalls = h.fake?.ports.notifyIfAbsent.mock.calls.length;
    const again = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(again.ok).toBe(true);
    expect(h.membersList.mock.calls.length).toBe(listCalls);
    expect(h.fake?.ports.notifyIfAbsent.mock.calls.length).toBe(notifyCalls);
    expect(h.fake?.delivered.size).toBe(5);
  });

  it("stops on a failed delivery, keeps the cursor before the failed page, and resumes without duplicates", async () => {
    const h = harness();
    h.fake?.failFor.add(memberId(3));
    const first = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.code).toBe("SYSTEM_UNAVAILABLE");
    }
    // Page one (members 1 and 2) was saved, page two (3 and 4) failed on member 3 and was not saved.
    expect(h.fake?.ports.saveProgress).toHaveBeenCalledTimes(1);
    expect(h.fake?.ports.saveProgress).toHaveBeenCalledWith(ANN_ID, "2");
    expect(h.fake?.ports.completeFanout).not.toHaveBeenCalled();
    expect(h.onFanoutError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain("hunter2");

    h.fake?.failFor.clear();
    const second = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(second.ok).toBe(true);
    expect(h.fake?.delivered.size).toBe(5);
    expect(h.fake?.ports.completeFanout).toHaveBeenCalledTimes(1);
    // Member 4 was already delivered during the failed run, so the retry found it and created nothing new for it.
    expect(h.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: "announcement.publish", detail: { created: 2, alreadyDelivered: 1 } }));
  });

  it("stops after the per call page limit, and a repeat call continues from the saved cursor", async () => {
    const h = harness({ maxBatchesPerCall: 1 });
    const first = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(first.ok).toBe(false);
    expect(h.fake?.delivered.size).toBe(2);
    expect(h.fake?.ports.saveProgress).toHaveBeenCalledWith(ANN_ID, "2");

    const second = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(second.ok).toBe(false);
    expect(h.fake?.delivered.size).toBe(4);

    const third = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(third.ok).toBe(true);
    expect(h.fake?.delivered.size).toBe(5);
    expect(h.fake?.ports.completeFanout).toHaveBeenCalledTimes(1);
  });

  it("gives up with INTERNAL when the member list repeats a cursor, instead of looping", async () => {
    const h = harness();
    h.membersList.mockImplementation(async () => ({ items: [], nextCursor: "x" }));
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
    }
    expect(h.onFanoutError).toHaveBeenCalledTimes(1);
    expect(h.fake?.ports.completeFanout).not.toHaveBeenCalled();
  });

  it("delivers nothing and still completes when there are no active members", async () => {
    const h = harness({ memberCount: 0 });
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(true);
    expect(h.fake?.delivered.size).toBe(0);
    expect(h.fake?.ports.completeFanout).toHaveBeenCalledTimes(1);
  });

  it("turns an unexpected repository error into INTERNAL with the request reference and no leaked detail", async () => {
    const h = harness();
    h.membersList.mockRejectedValueOnce(new Error("connection refused password=hunter2"));
    const result = await h.service.publish(ctx, { announcementId: ANN_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(result.error.reference).toBe("req-1");
    }
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(h.onUnexpectedError).toHaveBeenCalledTimes(1);
  });
});

describe("listPublished", () => {
  it("reads through the session repositories after a member permission check", async () => {
    const h = harness();
    const result = await h.service.listPublished(ctx, { limit: 10 });
    expect(result.ok).toBe(true);
    expect(h.requirePermission).toHaveBeenCalledWith(ctx, "member.profile.read");
    expect(h.forSession).toHaveBeenCalledTimes(1);
    expect(h.listPublished).toHaveBeenCalledWith({ limit: 10, cursor: null });
    expect(h.server).not.toHaveBeenCalled();
  });

  it("blocks before the session repositories when permission is denied", async () => {
    const h = harness({ auth: denied("PERMISSION_DENIED") });
    const result = await h.service.listPublished(ctx, { limit: 10 });
    expect(result.ok).toBe(false);
    expect(h.forSession).not.toHaveBeenCalled();
  });

  it("rejects an out of range page size", async () => {
    const h = harness();
    const result = await h.service.listPublished(ctx, { limit: 1000 });
    expect(result.ok).toBe(false);
    expect(h.listPublished).not.toHaveBeenCalled();
  });
});

describe("excerpt and link helpers", () => {
  it("keeps short text and collapses whitespace", () => {
    expect(buildExcerpt("  one\n\n two   three ")).toBe("one two three");
  });

  it("cuts long text to the limit including the ellipsis", () => {
    const out = buildExcerpt("a".repeat(1000));
    expect(Array.from(out).length).toBe(ANNOUNCEMENT_EXCERPT_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never splits an emoji when cutting", () => {
    const out = buildExcerpt("😀".repeat(500), 10);
    expect(Array.from(out)).toEqual([...Array(9).fill("😀"), "…"]);
  });

  it("builds a link the notification schema accepts", () => {
    expect(deepLinkSchema.safeParse(announcementLink(ANN_ID)).success).toBe(true);
  });
});
