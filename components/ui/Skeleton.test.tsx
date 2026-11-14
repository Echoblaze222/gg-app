import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Skeleton, SkeletonGroup } from "./Skeleton";

afterEach(cleanup);

describe("Skeleton", () => {
  it("is decorative and hidden from screen readers", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("applies shape and size", () => {
    const { container } = render(<Skeleton shape="circle" width={40} height="2.5rem" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("skeleton", "skeleton--circle");
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("2.5rem");
  });
});

describe("SkeletonGroup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing for fast loads, then the placeholders and one announcement", () => {
    const { container } = render(
      <SkeletonGroup label="Loading your balance">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(299));
    expect(container.querySelector(".skeleton")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector(".skeleton")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your balance");
  });

  it("marks the area busy", () => {
    const { container } = render(
      <SkeletonGroup label="Loading">
        <Skeleton />
      </SkeletonGroup>,
    );
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("never shows if the content arrives before the delay", () => {
    const { container, unmount } = render(
      <SkeletonGroup label="Loading">
        <Skeleton />
      </SkeletonGroup>,
    );
    act(() => vi.advanceTimersByTime(100));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector(".skeleton")).toBeNull();
  });
});
