import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import type { DataColumn } from "./DataTable";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Row {
  id: string;
  reference: string;
  amount: string;
  status: string;
}

const rows: Row[] = [
  { id: "1", reference: "GG-0001", amount: "NGN 5,000", status: "Paid" },
  { id: "2", reference: "GG-0002", amount: "NGN 5,000", status: "Pending" },
];

const columns: DataColumn<Row>[] = [
  { key: "reference", header: "Reference", cell: (r) => r.reference, primary: true },
  { key: "amount", header: "Amount", cell: (r) => r.amount, align: "end" },
  { key: "status", header: "Status", cell: (r) => r.status },
];

describe("DataTable", () => {
  it("renders a captioned table with headers and a row per item", () => {
    render(<DataTable caption="Payments" columns={columns} rows={rows} getRowId={(r) => r.id} />);
    const table = screen.getByRole("table", { name: "Payments" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Reference", "Amount", "Status"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("labels every cell with its heading so rows can collapse to cards", () => {
    render(<DataTable caption="Payments" columns={columns} rows={rows} getRowId={(r) => r.id} />);
    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveAttribute("data-label", "Amount");
    expect(cells[0]).toHaveAttribute("data-primary", "true");
    expect(cells.filter((c) => c.getAttribute("data-primary") === "true")).toHaveLength(2);
  });

  it("can hide the caption visually and keep it for screen readers", () => {
    render(<DataTable caption="Payments" hideCaption columns={columns} rows={rows} getRowId={(r) => r.id} />);
    expect(screen.getByText("Payments")).toHaveClass("sr-only");
  });

  it("shows an empty state when there are no rows", () => {
    render(
      <DataTable caption="Payments" columns={columns} rows={[]} getRowId={(r) => r.id} emptyTitle="No payments yet" emptyText="Payments you make will show here." />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "No payments yet" })).toBeInTheDocument();
  });

  it("shows an error with a retry and announces it", async () => {
    const onRetry = vi.fn();
    render(
      <DataTable caption="Payments" columns={columns} rows={rows} getRowId={(r) => r.id} error="We could not load your payments. No money moved." onRetry={onRetry} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No money moved.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows skeleton rows only after 300 ms and announces loading once", () => {
    vi.useFakeTimers();
    const { container } = render(
      <DataTable caption="Payments" columns={columns} rows={[]} getRowId={(r) => r.id} loading loadingLabel="Loading payments" />,
    );
    expect(container.querySelector(".skeleton")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Loading payments");
  });
});
