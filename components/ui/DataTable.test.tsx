import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";
import type { Column } from "./DataTable";

afterEach(cleanup);

interface Row {
  receipt: string;
  amount: string;
  status: string;
}
const rows: Row[] = [
  { receipt: "GG-001", amount: "NGN 5,000", status: "Paid" },
  { receipt: "GG-002", amount: "NGN 2,000", status: "Pending" },
];
const columns: Column<Row>[] = [
  { key: "receipt", header: "Receipt", cell: (r) => r.receipt, primary: true },
  { key: "amount", header: "Amount", cell: (r) => r.amount, align: "end" },
  { key: "status", header: "Status", cell: (r) => r.status },
];
const setup = (props = {}) => render(<DataTable caption="Payments" columns={columns} rows={rows} getRowId={(r) => r.receipt} {...props} />);

describe("DataTable", () => {
  it("is a table named by its caption", () => {
    setup();
    expect(screen.getByRole("table", { name: "Payments" })).toBeInTheDocument();
  });

  it("has column headers and a row per item", () => {
    setup();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Receipt", "Amount", "Status"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("renders cell content from the column functions", () => {
    setup();
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["GG-001", "NGN 5,000", "Paid"]);
  });

  it("labels every cell so phones can show label and value", () => {
    setup();
    const cells = within(screen.getAllByRole("row")[2]).getAllByRole("cell");
    expect(cells.map((c) => c.getAttribute("data-label"))).toEqual(["Receipt", "Amount", "Status"]);
  });

  it("marks the primary column and alignment for styling", () => {
    setup();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0]).toHaveAttribute("data-primary", "true");
    expect(cells[1]).not.toHaveAttribute("data-primary");
    expect(cells[1]).toHaveAttribute("data-align", "end");
    expect(cells[2]).toHaveAttribute("data-align", "start");
  });

  it("can hide the caption visually and keep it for screen readers", () => {
    setup({ hideCaption: true });
    expect(screen.getByText("Payments")).toHaveClass("sr-only");
    expect(screen.getByRole("table", { name: "Payments" })).toBeInTheDocument();
  });

  it("keeps rows stable by id when the order changes", () => {
    const { rerender } = setup();
    rerender(<DataTable caption="Payments" columns={columns} rows={[...rows].reverse()} getRowId={(r) => r.receipt} />);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0]).toHaveTextContent("GG-002");
  });

  it("renders only the header for no rows (empty states are the caller's job)", () => {
    setup({ rows: [] });
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });
});
