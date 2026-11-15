import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState, ErrorState, SuccessState, StateView } from "./StateView";

afterEach(cleanup);

describe("StateView", () => {
  it("renders title, text and action", () => {
    render(
      <EmptyState title="No payments yet" action={<button type="button">Make a payment</button>}>
        Your payments will show here.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "No payments yet" })).toBeInTheDocument();
    expect(screen.getByText("Your payments will show here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a payment" })).toBeInTheDocument();
  });

  it("announces errors at once, success politely, and keeps empty as plain content", () => {
    const { rerender } = render(<ErrorState title="Payment failed">No money left your account.</ErrorState>);
    expect(screen.getByRole("alert")).toHaveTextContent("No money left your account.");
    rerender(<SuccessState title="Payment received" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses a different icon shape per tone so color is never the only signal", () => {
    const shapes = new Set<string>();
    for (const tone of ["empty", "error", "success"] as const) {
      const { container, unmount } = render(<StateView tone={tone} title="Title" />);
      const svg = container.querySelector(".state__icon");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      shapes.add(svg!.innerHTML);
      unmount();
    }
    expect(shapes.size).toBe(3);
  });

  it("respects the heading level", () => {
    render(<EmptyState title="Inside a card" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});
