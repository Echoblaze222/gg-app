import { describe, expect, it } from "vitest";
import type { Notification } from "../../contracts/entities";
import type { AppErrorShape } from "../../contracts/errors";
import {
  MAX_SEEN_EVENT_IDS,
  feedReducer,
  hasMore,
  initialFeedState,
  needsRefresh,
  refreshToken,
  type NotificationFeedAction,
  type NotificationFeedState,
} from "./feed";

function note(id: string, readAt: string | null = null): Notification {
  return {
    id,
    memberId: "m1",
    type: "announcement",
    channel: "in_app",
    title: `t-${id}`,
    body: `b-${id}`,
    link: null,
    readAt,
    createdAt: "2026-11-14T00:00:00.000Z",
  };
}

const anError: AppErrorShape = {
  code: "SYSTEM_UNAVAILABLE",
  message: "The service is temporarily unavailable.",
  messageKey: "error.system_unavailable",
  moneyMoved: "unknown",
  retrySafe: true,
  action: "Try again shortly.",
  reference: "req-1",
};

function run(actions: NotificationFeedAction[], from: NotificationFeedState = initialFeedState): NotificationFeedState {
  return actions.reduce(feedReducer, from);
}

function loaded(items: Notification[], unread: number, nextCursor: string | null = null): NotificationFeedState {
  const token = refreshToken(initialFeedState);
  return run([{ type: "refresh_started" }, { type: "refresh_succeeded", startedSeq: token, items, nextCursor, unread }]);
}

describe("notification feed: loading", () => {
  it("asks for the first load, then stops asking once it succeeded", () => {
    expect(needsRefresh(initialFeedState)).toBe(true);
    const state = loaded([note("a")], 1);
    expect(needsRefresh(state)).toBe(false);
    expect(state.status).toBe("ready");
    expect(state.unread).toBe(1);
  });

  it("shows loading only until content exists, not during a background refresh", () => {
    expect(feedReducer(initialFeedState, { type: "refresh_started" }).status).toBe("loading");
    const ready = loaded([note("a")], 1);
    expect(feedReducer(ready, { type: "refresh_started" }).status).toBe("ready");
  });

  it("a failed first load becomes failed, a failed refresh keeps the old list", () => {
    const failedFirst = run([{ type: "refresh_started" }, { type: "refresh_failed", startedSeq: 1, error: anError }]);
    expect(failedFirst.status).toBe("failed");
    expect(failedFirst.error?.code).toBe("SYSTEM_UNAVAILABLE");
    expect(needsRefresh(failedFirst)).toBe(true);

    const ready = loaded([note("a")], 1);
    const failedLater = feedReducer(ready, { type: "refresh_failed", startedSeq: ready.appliedSeq, error: anError });
    expect(failedLater.status).toBe("ready");
    expect(failedLater.items).toHaveLength(1);
    expect(failedLater.error).not.toBeNull();
  });
});

describe("notification feed: realtime", () => {
  it("a duplicate event does not raise a second refresh request", () => {
    const base = loaded([], 0);
    const once = feedReducer(base, { type: "event_received", eventId: "e1" });
    const twice = feedReducer(once, { type: "event_received", eventId: "e1" });
    expect(needsRefresh(once)).toBe(true);
    expect(twice).toBe(once);
  });

  it("an event that arrives during a refresh is not lost when the older response lands", () => {
    const base = loaded([note("a")], 1);
    const token = refreshToken(base);
    const duringFetch = feedReducer(base, { type: "event_received", eventId: "e2" });
    const landed = feedReducer(duringFetch, {
      type: "refresh_succeeded",
      startedSeq: token,
      items: [note("a")],
      nextCursor: null,
      unread: 1,
    });
    expect(needsRefresh(landed)).toBe(true);
  });

  it("a response from an older request cannot overwrite newer data", () => {
    const base = loaded([], 0);
    const oldToken = refreshToken(base);
    const bumped = run([{ type: "event_received", eventId: "e3" }], base);
    const newToken = refreshToken(bumped);
    const fresh = feedReducer(bumped, {
      type: "refresh_succeeded",
      startedSeq: newToken,
      items: [note("new")],
      nextCursor: null,
      unread: 1,
    });
    const stale = feedReducer(fresh, {
      type: "refresh_succeeded",
      startedSeq: oldToken,
      items: [],
      nextCursor: null,
      unread: 0,
    });
    expect(stale).toBe(fresh);
    expect(stale.items.map((n) => n.id)).toEqual(["new"]);
  });

  it("a reconnect assumes events were lost and requests a refresh", () => {
    const base = loaded([note("a")], 1);
    expect(needsRefresh(base)).toBe(false);
    expect(needsRefresh(feedReducer(base, { type: "reconnected" }))).toBe(true);
  });

  it("remembers at most MAX_SEEN_EVENT_IDS event ids", () => {
    let state = loaded([], 0);
    for (let i = 0; i < MAX_SEEN_EVENT_IDS + 25; i += 1) {
      state = feedReducer(state, { type: "event_received", eventId: `e-${i}` });
    }
    expect(state.seenEventIds).toHaveLength(MAX_SEEN_EVENT_IDS);
    expect(state.seenEventIds.at(-1)).toBe(`e-${MAX_SEEN_EVENT_IDS + 24}`);
  });
});

describe("notification feed: pagination", () => {
  it("appends the next page without duplicates", () => {
    const base = loaded([note("a"), note("b")], 2, "c1");
    expect(hasMore(base)).toBe(true);
    const next = feedReducer(base, { type: "more_succeeded", cursor: "c1", items: [note("b"), note("c")], nextCursor: null });
    expect(next.items.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(hasMore(next)).toBe(false);
  });

  it("ignores a page that was requested with an old cursor", () => {
    const base = loaded([note("a")], 1, "c2");
    const next = feedReducer(base, { type: "more_succeeded", cursor: "c1", items: [note("zzz")], nextCursor: null });
    expect(next).toBe(base);
  });
});

describe("notification feed: read state", () => {
  it("marking read updates items and the badge, never below zero, and asks the server to confirm", () => {
    const base = loaded([note("a"), note("b", "2026-11-14T01:00:00.000Z")], 1);
    const next = feedReducer(base, { type: "marked_read", ids: ["a", "b"], at: "2026-11-14T02:00:00.000Z" });
    expect(next.items[0]?.readAt).toBe("2026-11-14T02:00:00.000Z");
    expect(next.items[1]?.readAt).toBe("2026-11-14T01:00:00.000Z");
    expect(next.unread).toBe(0);
    expect(needsRefresh(next)).toBe(true);
  });

  it("ids that are not loaded still trigger a confirm refresh and do not change the badge by guess", () => {
    const base = loaded([note("a")], 5);
    const next = feedReducer(base, { type: "marked_read", ids: ["not-loaded"], at: "2026-11-14T02:00:00.000Z" });
    expect(next.unread).toBe(5);
    expect(needsRefresh(next)).toBe(true);
  });

  it("mark all read clears the badge and asks the server to confirm", () => {
    const base = loaded([note("a"), note("b")], 2);
    const next = feedReducer(base, { type: "marked_all_read", at: "2026-11-14T02:00:00.000Z" });
    expect(next.unread).toBe(0);
    expect(next.items.every((n) => n.readAt !== null)).toBe(true);
    expect(needsRefresh(next)).toBe(true);
  });
});
