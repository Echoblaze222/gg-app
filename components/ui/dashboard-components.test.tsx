import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, EmptyState, ErrorState, NavLinks, ProgressRing, TimelinePills } from "./index";

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

afterEach(cleanup);

describe("ProgressRing", () => {
  it("exposes its meaning as text and clamps the ratio", () => {
    const { container } = render(<ProgressRing value={1.7} label="4 of 6 paid" />);
    expect(screen.getByRole("img", { name: "4 of 6 paid" })).toBeInTheDocument();
    expect(container.querySelector(".ring__value")?.getAttribute("stroke-dashoffset")).toBe("0");
  });
  it("treats NaN as empty, never as full", () => {
    const { container } = render(<ProgressRing value={Number.NaN} label="none" size={64} />);
    const c = 2 * Math.PI * ((64 - 6) / 2);
    expect(Number(container.querySelector(".ring__value")?.getAttribute("stroke-dashoffset"))).toBeCloseTo(c);
  });
});

describe("TimelinePills", () => {
  it("labels every status in text, so color is never the only signal", () => {
    render(
      <TimelinePills
        label="Schedule"
        items={[
          { id: "1", date: "Sat 21 Nov", title: "N5,000", status: "paid" },
          { id: "2", date: "Sat 28 Nov", title: "N5,000", status: "due" },
          { id: "3", date: "Sat 5 Dec", title: "N5,000", status: "upcoming" },
          { id: "4", date: "Sat 12 Dec", title: "N5,000", status: "overdue" },
          { id: "5", date: "Sat 19 Dec", title: "N5,000", status: "missed" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Schedule" });
    for (const word of ["Paid", "Due", "Upcoming", "Overdue", "Missed"]) expect(within(list).getByText(word)).toBeInTheDocument();
  });
  it("marks only entries that need attention with the black surface", () => {
    const { container } = render(<TimelinePills label="s" items={[{ id: "1", date: "d", title: "t", status: "paid" }, { id: "2", date: "d", title: "t", status: "due" }]} />);
    expect(container.querySelectorAll('[data-surface="ink"]')).toHaveLength(1);
  });
});

describe("EmptyState and ErrorState", () => {
  it("EmptyState explains and offers only the action it is given", () => {
    render(<EmptyState title="No schedule yet">Why it is empty.</EmptyState>);
    expect(screen.getByText("No schedule yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("ErrorState says what failed, whether money moved, what to do, and the reference", () => {
    render(<ErrorState title="Balance did not load" message="Service down." moneyLine="No money moved." action="Try again." reference="ref-1" retry={<button>Retry</button>} />);
    const alert = screen.getByRole("alert");
    for (const t of ["Balance did not load", "Service down.", "No money moved.", "Try again.", "Reference ref-1"]) expect(within(alert).getByText(t)).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("DataTable", () => {
  const cols = [
    { key: "ref", header: "Reference", cell: (r: { ref: string; amt: string }) => r.ref },
    { key: "amt", header: "Amount", align: "end" as const, cell: (r: { ref: string; amt: string }) => r.amt },
  ];
  it("renders one real table whose cells carry their column label for the phone layout", () => {
    render(<DataTable caption="Payments" columns={cols} rows={[{ ref: "a", amt: "5" }]} rowKey={(r) => r.ref} empty={<p>none</p>} />);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("table", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByText("5").closest("td")).toHaveAttribute("data-label", "Amount");
  });
  it("shows the empty state when there are no rows", () => {
    render(<DataTable caption="Payments" columns={cols} rows={[]} rowKey={(r) => r.ref} empty={<p>nothing here</p>} />);
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("NavLinks", () => {
  it("marks the current page and keeps every link keyboard reachable", () => {
    render(<NavLinks label="Main" variant="sidebar" items={[{ href: "/app", label: "Home", icon: "home", exact: true }, { href: "/app/history", label: "History", icon: "card" }]} />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "History" })).not.toHaveAttribute("aria-current");
  });
});
