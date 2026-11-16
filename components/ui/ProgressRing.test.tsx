import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressRing } from "./ProgressRing";

afterEach(cleanup);

const CIRCUMFERENCE = 2 * Math.PI * 45;

describe("ProgressRing", () => {
  it("is a named progressbar with its value", () => {
    render(<ProgressRing value={40} label="Contribution progress" />);
    const bar = screen.getByRole("progressbar", { name: "Contribution progress" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuetext", "40 percent");
  });

  it("speaks a custom value text", () => {
    render(<ProgressRing value={50} label="Progress" valueText="NGN 25,000 of 50,000" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "NGN 25,000 of 50,000");
  });

  it("clamps values and survives bad input", () => {
    for (const [input, expected] of [
      [150, "100"],
      [-5, "0"],
      [Number.NaN, "0"],
      [Number.POSITIVE_INFINITY, "0"],
      [33.4, "33"],
    ] as const) {
      const { unmount } = render(<ProgressRing value={input} label="Progress" />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", expected);
      unmount();
    }
  });

  it("draws the arc in proportion to the value", () => {
    const { container, rerender } = render(<ProgressRing value={25} label="Progress" />);
    const arc = () => Number(container.querySelector(".ring__arc")!.getAttribute("stroke-dashoffset"));
    expect(arc()).toBeCloseTo(CIRCUMFERENCE * 0.75, 3);
    rerender(<ProgressRing value={100} label="Progress" />);
    expect(arc()).toBeCloseTo(0, 3);
    rerender(<ProgressRing value={0} label="Progress" />);
    expect(arc()).toBeCloseTo(CIRCUMFERENCE, 3);
  });

  it("hides the drawing from screen readers and shows center content", () => {
    const { container } = render(
      <ProgressRing value={60} label="Progress">
        60%
      </ProgressRing>,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("applies the size", () => {
    render(<ProgressRing value={10} label="Progress" size={80} />);
    expect(screen.getByRole("progressbar")).toHaveStyle({ width: "80px", height: "80px" });
  });
});
