import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Turntable } from "./Turntable";

const props = {
  src: "/illustrations/test-360.webp",
  frames: 30,
  columns: 6,
  rows: 5,
  frameWidth: 440,
  frameHeight: 412,
  label: "Glass piggy bank",
  autoRotate: false,
} as const;

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => mockReducedMotion(false));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Turntable", () => {
  it("is a named slider so keyboard and screen reader users can turn it", () => {
    render(<Turntable {...props} />);
    const slider = screen.getByRole("slider", { name: "Glass piggy bank" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "29");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(slider).toHaveAttribute("aria-valuetext", "0 degrees");
    expect(slider).toHaveAttribute("tabindex", "0");
    expect(slider).toHaveAccessibleDescription(/arrow keys/i);
  });

  it("turns with the arrow keys and reports the angle", async () => {
    render(<Turntable {...props} />);
    const slider = screen.getByRole("slider");
    act(() => slider.focus());
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "1"));
    expect(slider).toHaveAttribute("aria-valuetext", "12 degrees");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "29"));
    expect(slider).toHaveAttribute("aria-valuetext", "348 degrees");
  });

  it("turns when dragged sideways", async () => {
    render(<Turntable {...props} />);
    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 100, button: 0 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 180 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 260 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 260 });
    await waitFor(() => expect(Number(slider.getAttribute("aria-valuenow"))).toBeGreaterThan(0));
  });

  it("shows the drag hint until the first touch", () => {
    render(<Turntable {...props} />);
    expect(screen.getByText("Drag to rotate")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("slider"), { pointerId: 1, clientX: 10, button: 0 });
    expect(screen.queryByText("Drag to rotate")).not.toBeInTheDocument();
  });

  it("does not turn by itself with reduced motion", async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    try {
      render(<Turntable {...props} autoRotate />);
      const slider = screen.getByRole("slider");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(slider).toHaveAttribute("aria-valuenow", "0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("draws the platform and floor shadow only when the stage is on", () => {
    const { container, rerender } = render(<Turntable {...props} />);
    expect(container.querySelector(".turntable__floor")).not.toBeNull();
    expect(container.querySelector(".turntable__platform")).not.toBeNull();
    rerender(<Turntable {...props} stage={false} />);
    expect(container.querySelector(".turntable__floor")).toBeNull();
  });

  it("keeps the decorative layers out of the accessibility tree", () => {
    const { container } = render(<Turntable {...props} />);
    for (const layer of container.querySelectorAll(".turntable__layer")) {
      expect(layer).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("renders children in the same space and keeps --spin in step with the turn", async () => {
    render(
      <Turntable {...props}>
        <span data-testid="orbiter" />
      </Turntable>,
    );
    const slider = screen.getByRole("slider");
    expect(slider).toContainElement(screen.getByTestId("orbiter"));
    act(() => slider.focus());
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    await waitFor(() => expect(slider.style.getPropertyValue("--spin")).toBe("12.00deg"));
  });
});
