import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressRing, toRatio } from "./ProgressRing";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("toRatio", () => {
  it("clamps and survives bad input", () => {
    expect(toRatio(42, 60)).toBeCloseTo(0.7);
    expect(toRatio(80, 60)).toBe(1);
    expect(toRatio(-5, 60)).toBe(0);
    expect(toRatio(5, 0)).toBe(0);
    expect(toRatio(Number.NaN, 10)).toBe(0);
  });
});

describe("ProgressRing", () => {
  it("is a progressbar with a name and a value", () => {
    render(<ProgressRing value={42} max={60} label="Cycle collection" caption="42 of 60 paid" />);
    const bar = screen.getByRole("progressbar", { name: "Cycle collection" });
    expect(bar).toHaveAttribute("aria-valuenow", "70");
    expect(bar).toHaveAttribute("aria-valuetext", "70 percent");
    expect(screen.getByText("42 of 60 paid")).toBeInTheDocument();
  });

  it("does not claim success from the number alone", () => {
    render(<ProgressRing value={60} max={60} label="Cycle collection" />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toHaveTextContent("");
    expect(document.querySelector(".ring__icon")).toBeNull();
  });

  it("shows the success icon and announces only when the parent says success", () => {
    render(<ProgressRing value={60} max={60} label="Cycle collection" status="success" successLabel="Cycle fully collected" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cycle fully collected");
    expect(document.querySelector(".ring__icon")).not.toBeNull();
  });

  it("shows the failure state with text and icon instead of a value", () => {
    render(<ProgressRing value={10} label="Cycle collection" status="failure" failureLabel="Could not load collection" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("img", { name: "Cycle collection" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Could not load collection");
    expect(document.querySelector(".ring__icon")).not.toBeNull();
  });

  describe("loading", () => {
    beforeEach(() => vi.useFakeTimers());

    it("announces loading and draws the spinner only after 300 ms", () => {
      render(<ProgressRing value={0} label="Cycle collection" status="loading" loadingLabel="Loading collection" />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading collection");
      expect(document.querySelector(".ring__spin")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(document.querySelector(".ring__spin")).not.toBeNull();
    });
  });
});
