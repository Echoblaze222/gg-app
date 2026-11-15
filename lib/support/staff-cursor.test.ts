import { describe, expect, it, vi } from "vitest";
import type { Page, PageRequest, SupportTicket } from "../../contracts/entities";
import type { SupportTicketStatus } from "../../contracts/enums";
import { STAFF_STATUS_ORDER, decodeStaffCursor, encodeStaffCursor, listAcrossStatuses } from "./staff-cursor";

function ticket(id: string, status: SupportTicketStatus): SupportTicket {
  return { id, memberId: "m1", subject: `s-${id}`, status, createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T00:00:00.000Z" };
}

/** Fake repository: numeric offset cursors per status. */
function fakeRepo(data: Partial<Record<SupportTicketStatus, string[]>>) {
  return vi.fn(async (status: SupportTicketStatus, page: PageRequest): Promise<Page<SupportTicket>> => {
    const ids = data[status] ?? [];
    const start = page.cursor ? Number(page.cursor) : 0;
    const slice = ids.slice(start, start + page.limit);
    const next = start + page.limit < ids.length ? String(start + page.limit) : null;
    return { items: slice.map((id) => ticket(id, status)), nextCursor: next };
  });
}

async function walk(repo: ReturnType<typeof fakeRepo>, limit: number): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: Page<SupportTicket> | null = await listAcrossStatuses(repo, { limit, cursor });
    if (page === null) {
      throw new Error("unexpected invalid cursor");
    }
    ids.push(...page.items.map((t) => t.id));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 20);
  return { ids, pages };
}

describe("staff cursor encoding", () => {
  it("round trips, including an inner cursor that contains the separator", () => {
    expect(decodeStaffCursor(encodeStaffCursor(2, "a|b"))).toEqual({ index: 2, inner: "a|b" });
    expect(decodeStaffCursor(encodeStaffCursor(4, null))).toEqual({ index: 4, inner: null });
  });

  it.each([[null], [undefined], [""]])("treats %s as the start", (cursor) => {
    expect(decodeStaffCursor(cursor)).toEqual({ index: 0, inner: null });
  });

  it.each([["x"], ["9|a"], ["5|a"], ["12|a"], ["-1|a"], ["2a"]])("rejects a cursor we did not create: %s", (cursor) => {
    expect(decodeStaffCursor(cursor)).toBeNull();
  });
});

describe("listAcrossStatuses", () => {
  const data = { open: ["o1", "o2", "o3"], pending_staff: ["p1"], pending_member: [], resolved: ["r1", "r2"], closed: ["c1"] };
  const expected = ["o1", "o2", "o3", "p1", "r1", "r2", "c1"];

  it.each([[1], [2], [3], [7], [100]])("walks every status in order with page size %i, without gaps or duplicates", async (limit) => {
    const repo = fakeRepo(data);
    const { ids } = await walk(repo, limit);
    expect(ids).toEqual(expected);
    for (const call of repo.mock.calls) {
      expect(call[1].limit).toBeGreaterThanOrEqual(1);
    }
  });

  it("starts with the statuses that need staff", () => {
    expect(STAFF_STATUS_ORDER.slice(0, 2)).toEqual(["open", "pending_staff"]);
  });

  it("returns one final page for a big page size", async () => {
    const result = await listAcrossStatuses(fakeRepo(data), { limit: 100 });
    expect(result?.items).toHaveLength(7);
    expect(result?.nextCursor).toBeNull();
  });

  it("returns an empty list when there are no tickets", async () => {
    const result = await listAcrossStatuses(fakeRepo({}), { limit: 10 });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("returns null for a bad cursor and asks the repository for nothing", async () => {
    const repo = fakeRepo(data);
    expect(await listAcrossStatuses(repo, { limit: 10, cursor: "zzz" })).toBeNull();
    expect(repo).not.toHaveBeenCalled();
  });
});
