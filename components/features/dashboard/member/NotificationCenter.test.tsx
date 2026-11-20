import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { Notification } from "@/contracts/entities";

const list = vi.fn();
const unread = vi.fn();
const markRead = vi.fn();
const markAll = vi.fn();
vi.mock("@/lib/dashboard/actions", () => ({ listNotificationsAction: (...a: unknown[]) => list(...a), unreadCountAction: () => unread(), markReadAction: (...a: unknown[]) => markRead(...a), markAllReadAction: () => markAll() }));
vi.mock("next/link", () => ({ default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: () => void }) => <a href={href} onClick={onClick} {...rest}>{children}</a> }));

import { NotificationCenter } from "./NotificationCenter";

const n = (id: string, o: Partial<Notification> = {}): Notification => ({ id, memberId: "m", type: "payment_confirmed", title: `Title ${id}`, body: `Body ${id}`, link: null, readAt: null, createdAt: "2026-11-10T10:00:00Z", ...o }) as Notification;
const ok = <T,>(value: T) => ({ ok: true as const, value });

beforeEach(() => {
  for (const f of [list, unread, markRead, markAll]) f.mockReset();
});
afterEach(cleanup);

describe("NotificationCenter", () => {
  it("shows the seeded list, marks unread items as text, and never links to a missing screen", () => {
    render(<NotificationCenter initial={{ items: [n("1", { link: "/app/history/GG-1" }), n("2", { link: "/app/withdrawals" })], nextCursor: null, unread: 2 }} />);
    expect(screen.getByText("2 unread")).toBeInTheDocument();
    expect(screen.getAllByText("Unread.", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "View" })).toHaveLength(1);
  });
  it("explains an empty list", () => {
    render(<NotificationCenter initial={{ items: [], nextCursor: null, unread: 0 }} />);
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });
  it("marks one read after the server confirms, then refetches to confirm the truth", async () => {
    markRead.mockResolvedValue(ok(undefined));
    list.mockResolvedValue(ok({ items: [n("1", { readAt: "2026-11-10T11:00:00Z" })], nextCursor: null }));
    unread.mockResolvedValue(ok(0));
    render(<NotificationCenter initial={{ items: [n("1")], nextCursor: null, unread: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(screen.getByText("You are up to date.")).toBeInTheDocument());
    expect(markRead).toHaveBeenCalledWith({ ids: ["1"] });
    await waitFor(() => expect(list).toHaveBeenCalled());
  });
  it("when marking fails the item stays unread and the member is told", async () => {
    markRead.mockResolvedValue({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "r1" }).toShape() });
    render(<NotificationCenter initial={{ items: [n("1")], nextCursor: null, unread: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(screen.getByText("That did not save")).toBeInTheDocument());
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
  it("loads more without duplicating and keeps the list if it fails", async () => {
    list.mockResolvedValueOnce({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "r2" }).toShape() });
    render(<NotificationCenter initial={{ items: [n("1")], nextCursor: "c1", unread: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("More notifications did not load")).toBeInTheDocument());
    expect(screen.getByText("Title 1")).toBeInTheDocument();
    list.mockResolvedValueOnce(ok({ items: [n("1"), n("2")], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Could not load. Try again." }));
    await waitFor(() => expect(screen.getByText("Title 2")).toBeInTheDocument());
    expect(screen.getAllByText("Title 1")).toHaveLength(1);
  });
});
