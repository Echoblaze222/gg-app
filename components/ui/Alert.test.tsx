import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert } from "./Alert";

afterEach(cleanup);

describe("Alert", () => {
  it("renders title and text", () => {
    render(<Alert title="Saved">Your contribution was recorded.</Alert>);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your contribution was recorded.")).toBeInTheDocument();
  });

  it("announces errors right away and other tones politely", () => {
    const { rerender } = render(<Alert tone="error">Payment failed. No money left your account.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("No money left your account");
    for (const tone of ["info", "success", "pending", "warning"] as const) {
      rerender(<Alert tone={tone}>Message</Alert>);
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    }
  });

  it("gives every tone its own icon shape so color is never the only signal", () => {
    const shapes = new Set<string>();
    for (const tone of ["info", "success", "pending", "warning", "error"] as const) {
      const { container, unmount } = render(<Alert tone={tone}>Message</Alert>);
      const svg = container.querySelector(".alert__icon");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      shapes.add(svg!.innerHTML);
      unmount();
    }
    expect(shapes.size).toBe(5);
  });

  it("has no close button unless onDismiss is given", () => {
    render(<Alert>Message</Alert>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onDismiss from the close button", async () => {
    const onDismiss = vi.fn();
    render(<Alert onDismiss={onDismiss}>Message</Alert>);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
