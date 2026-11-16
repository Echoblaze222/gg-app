import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimelinePills } from "./TimelinePills";
import type { TimelineStep } from "./TimelinePills";

afterEach(cleanup);

const steps: TimelineStep[] = [
  { id: "a", label: "Started", state: "done" },
  { id: "b", label: "Checking", state: "current" },
  { id: "c", label: "Confirmed", state: "upcoming" },
  { id: "d", label: "Failed step", state: "failed" },
];

describe("TimelinePills", () => {
  it("is a named ordered list with one item per step", () => {
    render(<TimelinePills steps={steps} label="Payment progress" />);
    const list = screen.getByRole("list", { name: "Payment progress" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("names every state in text, not only by color", () => {
    render(<TimelinePills steps={steps} label="Payment progress" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Started, Completed");
    expect(items[1]).toHaveTextContent("Checking, Current step");
    expect(items[2]).toHaveTextContent("Confirmed, Not reached yet");
    expect(items[3]).toHaveTextContent("Failed step, Failed");
  });

  it("marks only the current step with aria-current", () => {
    render(<TimelinePills steps={steps} label="Payment progress" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
  });

  it("gives each state its own icon shape", () => {
    const { container } = render(<TimelinePills steps={steps} label="Payment progress" />);
    const shapes = [...container.querySelectorAll(".pills__icon")].map((svg) => svg.innerHTML);
    expect(new Set(shapes).size).toBe(4);
  });

  it("applies a state class for styling", () => {
    render(<TimelinePills steps={steps} label="Payment progress" />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("pills__item--done");
    expect(items[3]).toHaveClass("pills__item--failed");
  });
});
