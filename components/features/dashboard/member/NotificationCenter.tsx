"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { Alert, Button, EmptyState } from "@/components/ui";
import { AppError } from "@/contracts/errors";
import type { AppErrorShape } from "@/contracts/errors";
import type { Notification } from "@/contracts/entities";
import { listNotificationsAction, markAllReadAction, markReadAction, unreadCountAction } from "@/lib/dashboard/actions";
import { describeError } from "@/lib/dashboard/describe-error";
import { formatStamp } from "@/lib/dashboard/display";
import { isBuiltRoute } from "@/lib/dashboard/routes";
import { feedReducer, hasMore, initialFeedState, needsRefresh, refreshToken } from "@/lib/notifications/feed";

export interface NotificationCenterProps {
  initial: { items: Notification[]; nextCursor: string | null; unread: number };
}

/** Automatic refetch attempts before the member is asked to retry by hand. Backoff in ms, plus jitter. */
const BACKOFF_MS = [2000, 5000, 15000] as const;

const noReply = () => new AppError("SYSTEM_UNAVAILABLE", { reference: "no-reply" }).toShape();

/**
 * Notification center. State and ordering rules come from AI-5's reducer (lib/notifications/feed.ts): the server stays the source of
 * truth, events only request a refetch, a late response never overwrites newer data, a reconnect always refetches.
 * Mark read waits for the server before the list changes, so a refetch cannot race the write and flip an item back.
 */
export function NotificationCenter({ initial }: NotificationCenterProps) {
  const [state, dispatch] = useReducer(feedReducer, initial, (i) =>
    feedReducer(initialFeedState, { type: "refresh_succeeded", startedSeq: refreshToken(initialFeedState), items: i.items, nextCursor: i.nextCursor, unread: i.unread }),
  );
  const [failures, setFailures] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<AppErrorShape | null>(null);
  const [moreError, setMoreError] = useState<AppErrorShape | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Back online: anything may have changed, so ask for a refetch.
  useEffect(() => {
    const onOnline = () => dispatch({ type: "reconnected" });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Refetch whenever the reducer says the server may have newer data. Capped backoff, then a manual retry.
  useEffect(() => {
    if (!needsRefresh(state) || failures > BACKOFF_MS.length || !navigator.onLine) return;
    const token = refreshToken(state);
    const delay = failures === 0 ? 0 : Math.round(BACKOFF_MS[failures - 1] * (0.8 + 0.4 * Math.random()));
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [list, unread] = await Promise.all([listNotificationsAction({ cursor: null }), unreadCountAction()]);
        if (cancelled) return;
        if (list.ok && unread.ok) {
          dispatch({ type: "refresh_succeeded", startedSeq: token, items: list.value.items, nextCursor: list.value.nextCursor, unread: unread.value });
          setFailures(0);
        } else {
          dispatch({ type: "refresh_failed", startedSeq: token, error: !list.ok ? list.error : !unread.ok ? unread.error : noReply() });
          setFailures((f) => f + 1);
        }
      } catch {
        if (cancelled) return;
        dispatch({ type: "refresh_failed", startedSeq: token, error: noReply() });
        setFailures((f) => f + 1);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, failures]);

  async function mark(ids: string[] | "all") {
    setBusy(ids === "all" ? "all" : ids[0]);
    setActionError(null);
    try {
      const result = ids === "all" ? await markAllReadAction() : await markReadAction({ ids });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      const at = new Date().toISOString();
      dispatch(ids === "all" ? { type: "marked_all_read", at } : { type: "marked_read", ids, at });
    } catch {
      setActionError(noReply());
    } finally {
      setBusy(null);
    }
  }

  async function loadMore() {
    if (state.nextCursor === null || loadingMore) return;
    const cursor = state.nextCursor;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await listNotificationsAction({ cursor });
      if (result.ok) dispatch({ type: "more_succeeded", cursor, items: result.value.items, nextCursor: result.value.nextCursor });
      else setMoreError(result.error);
    } catch {
      setMoreError(noReply());
    } finally {
      setLoadingMore(false);
    }
  }

  const unread = state.unread ?? 0;
  const refreshError = state.error ? describeError(state.error, "The list may be out of date") : null;
  const actionCopy = actionError ? describeError(actionError, "That did not save") : null;
  const moreCopy = moreError ? describeError(moreError, "More notifications did not load") : null;

  return (
    <div className="tile">
      <div className="tile__head">
        <p className="tile__note" aria-live="polite">
          {unread === 0 ? "You are up to date." : `${unread} unread`}
        </p>
        <Button variant="secondary" disabled={unread === 0} status={busy === "all" ? "loading" : "idle"} loadingLabel="Marking all as read" onClick={() => mark("all")}>
          Mark all as read
        </Button>
      </div>

      {refreshCopyAlert(refreshError, failures > BACKOFF_MS.length, () => setFailures(0))}
      {actionCopy ? (
        <Alert tone="error" title={actionCopy.title}>
          {actionCopy.message} {actionCopy.moneyLine} {actionCopy.action} Reference {actionCopy.reference}.
        </Alert>
      ) : null}

      {state.items.length === 0 ? (
        <EmptyState title="No notifications yet">
          Reminders, payment updates and security alerts show here.
        </EmptyState>
      ) : (
        <ul className="rows">
          {state.items.map((n) => (
            <li key={n.id} className="rows__item" data-unread={n.readAt === null}>
              <div className="rows__main">
                <p className="rows__title">
                  {n.readAt === null ? <span className="sr-only">Unread. </span> : null}
                  {n.title}
                </p>
                <p className="rows__meta" style={{ overflowWrap: "anywhere" }}>
                  {n.body}
                </p>
                <p className="rows__meta">{formatStamp(n.createdAt)}</p>
                <div className="hero__actions">
                  {isBuiltRoute(n.link) ? (
                    <Link href={n.link} className="btn btn--quiet" onClick={() => n.readAt === null && void mark([n.id])}>
                      View
                    </Link>
                  ) : null}
                  {n.readAt === null ? (
                    <Button variant="quiet" status={busy === n.id ? "loading" : "idle"} loadingLabel="Marking as read" onClick={() => mark([n.id])}>
                      Mark as read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {moreCopy ? (
        <Alert tone="error" title={moreCopy.title}>
          {moreCopy.message} {moreCopy.action} Reference {moreCopy.reference}.
        </Alert>
      ) : null}
      {hasMore(state) ? (
        <div>
          <Button variant="secondary" status={loadingMore ? "loading" : moreError ? "failure" : "idle"} loadingLabel="Loading" failureLabel="Could not load. Try again." onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function refreshCopyAlert(copy: ReturnType<typeof describeError> | null, gaveUp: boolean, retry: () => void) {
  if (!copy) return null;
  return (
    <Alert tone="warning" title={copy.title}>
      {copy.message} {copy.moneyLine} {copy.action} Reference {copy.reference}.
      {gaveUp ? (
        <span style={{ display: "block", marginTop: "var(--space-2)" }}>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </span>
      ) : null}
    </Alert>
  );
}
