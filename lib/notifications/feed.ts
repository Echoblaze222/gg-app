import type { Notification } from "../../contracts/entities";
import type { AppErrorShape } from "../../contracts/errors";

/**
 * Client side state for the notification center. Pure and deterministic, so it can be tested without a browser.
 *
 * Design rules (from the pack, section 10):
 * - Realtime events only say that something changed. They carry ids, not content, so an event never edits the
 *   list. It raises a refresh request and the server stays the source of truth.
 * - Duplicate events must not cause extra work. Lost events are assumed after a reconnect, so a reconnect also
 *   raises a refresh request.
 * - A refresh that finishes late must not overwrite newer data, and an event that arrives during a refresh must
 *   not be lost. Both are handled with two counters: requestedSeq and appliedSeq.
 */

export const MAX_SEEN_EVENT_IDS = 200;

export interface NotificationFeedState {
  /** Status of the content. A background refresh keeps `ready` so the list never flashes empty. */
  readonly status: "idle" | "loading" | "ready" | "failed";
  readonly items: readonly Notification[];
  readonly nextCursor: string | null;
  /** Null until the server has answered once. */
  readonly unread: number | null;
  /** Raised each time something says the server state may have changed. Starts at 1 so the first load is requested. */
  readonly requestedSeq: number;
  /** The requestedSeq value that the newest applied refresh was started with. */
  readonly appliedSeq: number;
  /** Bounded memory of event ids, to ignore duplicates. A very old duplicate may cost one harmless extra refresh. */
  readonly seenEventIds: readonly string[];
  readonly error: AppErrorShape | null;
}

export const initialFeedState: NotificationFeedState = {
  status: "idle",
  items: [],
  nextCursor: null,
  unread: null,
  requestedSeq: 1,
  appliedSeq: 0,
  seenEventIds: [],
  error: null,
};

export type NotificationFeedAction =
  | { type: "refresh_started" }
  | { type: "refresh_succeeded"; startedSeq: number; items: readonly Notification[]; nextCursor: string | null; unread: number }
  | { type: "refresh_failed"; startedSeq: number; error: AppErrorShape }
  | { type: "more_succeeded"; cursor: string; items: readonly Notification[]; nextCursor: string | null }
  | { type: "event_received"; eventId: string }
  | { type: "reconnected" }
  | { type: "marked_read"; ids: readonly string[]; at: string }
  | { type: "marked_all_read"; at: string };

/** True when the server may have newer data than the screen shows. */
export function needsRefresh(state: NotificationFeedState): boolean {
  return state.requestedSeq > state.appliedSeq;
}

/** Read this BEFORE starting the fetch and pass it back as `startedSeq` when the fetch finishes. */
export function refreshToken(state: NotificationFeedState): number {
  return state.requestedSeq;
}

export function hasMore(state: NotificationFeedState): boolean {
  return state.nextCursor !== null;
}

function rememberEvent(ids: readonly string[], id: string): readonly string[] {
  const next = [...ids, id];
  return next.length > MAX_SEEN_EVENT_IDS ? next.slice(next.length - MAX_SEEN_EVENT_IDS) : next;
}

export function feedReducer(state: NotificationFeedState, action: NotificationFeedAction): NotificationFeedState {
  switch (action.type) {
    case "refresh_started": {
      if (state.status === "ready") {
        return state;
      }
      return { ...state, status: "loading", error: null };
    }

    case "refresh_succeeded": {
      // A response from an older request must never overwrite newer data.
      if (action.startedSeq < state.appliedSeq) {
        return state;
      }
      return {
        ...state,
        status: "ready",
        items: action.items,
        nextCursor: action.nextCursor,
        unread: action.unread,
        appliedSeq: action.startedSeq,
        error: null,
      };
    }

    case "refresh_failed": {
      if (action.startedSeq < state.appliedSeq) {
        return state;
      }
      // Keep showing what we have. Only a screen that never loaded becomes failed.
      return { ...state, status: state.status === "ready" ? "ready" : "failed", error: action.error };
    }

    case "more_succeeded": {
      // A page requested with an old cursor is stale once the list was refreshed.
      if (action.cursor !== state.nextCursor) {
        return state;
      }
      const known = new Set(state.items.map((item) => item.id));
      const added = action.items.filter((item) => !known.has(item.id));
      return { ...state, items: [...state.items, ...added], nextCursor: action.nextCursor };
    }

    case "event_received": {
      if (state.seenEventIds.includes(action.eventId)) {
        return state;
      }
      return { ...state, seenEventIds: rememberEvent(state.seenEventIds, action.eventId), requestedSeq: state.requestedSeq + 1 };
    }

    case "reconnected": {
      return { ...state, requestedSeq: state.requestedSeq + 1 };
    }

    case "marked_read": {
      const targets = new Set(action.ids);
      let flipped = 0;
      const items = state.items.map((item) => {
        if (targets.has(item.id) && item.readAt === null) {
          flipped += 1;
          return { ...item, readAt: action.at };
        }
        return item;
      });
      // Ids that are not loaded cannot be counted here, so always ask the server to confirm the count.
      return {
        ...state,
        items,
        unread: state.unread === null ? null : Math.max(0, state.unread - flipped),
        requestedSeq: state.requestedSeq + 1,
      };
    }

    case "marked_all_read": {
      return {
        ...state,
        items: state.items.map((item) => (item.readAt === null ? { ...item, readAt: action.at } : item)),
        unread: 0,
        requestedSeq: state.requestedSeq + 1,
      };
    }
  }
}
