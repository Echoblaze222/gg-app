import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelinePills } from "./TimelinePills";
import type { TimelineItem } from "./TimelinePills";

afterEach(cleanup);

const items: TimelineItem[] = [
  { id: "a", date: "5 Oct", label: "Instalment 1", status: "paid" },
  { id: "b", date: "5 Nov", label: "Instalment 2", status: "overdue" },
  { id: "c", date: "5 Dec", label: "Instalment 3", status: "pending" },
  { id: "d", date: "5 Jan", label: "Instalment 4", status: "upcoming", current: true },
];

describe("TimelinePills", () => {
  it("is a named ordered list with one item per entry", () => {
    render(<TimelinePills label="Contribution schedule" items={items} />);
    const list = screen.getByRole("list", { name: "Contribution schedule" });
    expect(list.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("says the status in words on every pill, never color alone", () => {
    render(<TimelinePills label="Schedule" items={items} />);
    for (const word of ["Paid", "Overdue", "Pending", "Upcoming"]) expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("gives each status its own icon shape", () => {
    const { container } = render(<TimelinePills label="Schedule" items={items} />);
    const shapes = new Set(Array.from(container.querySelectorAll(".pill__icon")).map((svg) => svg.innerHTML));
    expect(shapes.size).toBe(4);
  });

  it("marks the next due item as the current step", () => {
    render(<TimelinePills label="Schedule" items={items} />);
    const current = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("5 Jan");
  });

  it("renders plain items without onSelect and buttons with it", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TimelinePills label="Schedule" items={items} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<TimelinePills label="Schedule" items={items} onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("does not make disabled pills pressable", () => {
    render(<TimelinePills label="Schedule" items={[{ ...items[0], disabled: true }]} onSelect={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("accepts translated status words", () => {
    render(<TimelinePills label="Schedule" items={[items[0]]} statusLabels={{ paid: "Paid up" }} />);
    expect(screen.getByText("Paid up")).toBeInTheDocument();
  });
});
