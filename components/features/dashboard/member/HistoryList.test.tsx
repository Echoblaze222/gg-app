import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { HistoryRow } from "@/lib/member/history";

const loadPage = vi.fn();
vi.mock("@/lib/dashboard/actions", () => ({ loadHistoryPageAction: (...a: unknown[]) => loadPage(...a) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { HistoryList } from "./HistoryList";

const row = (id: string, o: Partial<HistoryRow> = {}): HistoryRow => ({ id, dateLagos: "2026-11-10", amount: "\u20A62,500.00", purposeLabel: "Contribution", channelLabel: "Card", reference: `ref-${id}`, statusLabel: "Successful", tone: "success", explanation: "Confirmed.", failure: null, receiptNumber: null, href: null, ...o }) as HistoryRow;

beforeEach(() => loadPage.mockReset());
afterEach(cleanup);

describe("HistoryList", () => {
  it("shows an honest empty state", () => {
    render(<HistoryList initial={{ rows: [], skipped: 0, nextCursor: null }} />);
    expect(screen.getByText("No payments yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
  it("links a receipt and shows the status as text", () => {
    render(<HistoryList initial={{ rows: [row("a", { receiptNumber: "GG-0001", href: "/app/history/GG-0001" })], skipped: 0, nextCursor: null }} />);
    expect(screen.getByRole("link", { name: "GG-0001" })).toHaveAttribute("href", "/app/history/GG-0001");
    expect(screen.getByText("Successful")).toBeInTheDocument();
  });
  it("appends the next page without duplicating rows", async () => {
    loadPage.mockResolvedValue({ ok: true, value: { rows: [row("a"), row("b")], skipped: 0, nextCursor: null } });
    render(<HistoryList initial={{ rows: [row("a")], skipped: 0, nextCursor: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("Reference ref-b")).toBeInTheDocument());
    expect(screen.getAllByText("Reference ref-a")).toHaveLength(1);
    expect(loadPage).toHaveBeenCalledWith({ cursor: "c1" });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
  it("keeps the list and explains when the next page fails", async () => {
    loadPage.mockResolvedValue({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "r9" }).toShape() });
    render(<HistoryList initial={{ rows: [row("a")], skipped: 0, nextCursor: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText("More payments did not load")).toBeInTheDocument());
    expect(screen.getByText("Reference ref-a")).toBeInTheDocument();
    expect(screen.getByText(/Reference r9/)).toBeInTheDocument();
  });
  it("tells the member when rows were skipped", () => {
    render(<HistoryList initial={{ rows: [row("a")], skipped: 2, nextCursor: null }} />);
    expect(screen.getByText("Some payments are not shown")).toBeInTheDocument();
  });
});
