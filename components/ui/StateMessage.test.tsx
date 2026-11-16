import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StateMessage } from "./StateMessage";
import type { StateKind } from "./StateMessage";

afterEach(cleanup);

const kinds: StateKind[] = ["empty", "error", "offline", "success"];

describe("StateMessage", () => {
  it("renders title, message and action", () => {
    render(<StateMessage kind="empty" title="No payments yet" message="Your receipts will show here." action={<button type="button">Contribute</button>} />);
    expect(screen.getByRole("heading", { name: "No payments yet", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Your receipts will show here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contribute" })).toBeInTheDocument();
  });

  it("supports heading level 3 for use inside another section", () => {
    render(<StateMessage kind="empty" title="Nothing here" headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });

  it("gives every kind its own icon so color is never the only signal", () => {
    const shapes = new Set<string>();
    for (const kind of kinds) {
      const { container, unmount } = render(<StateMessage kind={kind} title="Title" />);
      const svg = container.querySelector(".state__icon svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      shapes.add(svg!.innerHTML);
      unmount();
    }
    expect(shapes.size).toBe(4);
  });

  it("is page content, not a live announcement", () => {
    render(<StateMessage kind="error" title="Could not load" message="Nothing was charged." />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("omits the optional parts when not given", () => {
    const { container } = render(<StateMessage kind="success" title="Done" />);
    expect(container.querySelector(".state__message")).toBeNull();
    expect(container.querySelector(".state__action")).toBeNull();
  });
});
