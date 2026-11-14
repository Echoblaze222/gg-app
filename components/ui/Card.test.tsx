import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./Card";

afterEach(cleanup);

describe("Card", () => {
  it("renders a white card by default", () => {
    render(<Card>Balance</Card>);
    const card = screen.getByText("Balance");
    expect(card).toHaveClass("card", "card--surface");
    expect(card).not.toHaveAttribute("data-surface");
  });

  it("renders the black hero card with the ink surface attribute", () => {
    render(<Card tone="ink">Balance</Card>);
    expect(screen.getByText("Balance")).toHaveAttribute("data-surface", "ink");
  });

  it("supports large padding", () => {
    render(<Card padding="lg">Balance</Card>);
    expect(screen.getByText("Balance")).toHaveClass("card--lg");
  });

  it("can render as a section", () => {
    render(<Card as="section">Balance</Card>);
    expect(screen.getByText("Balance").tagName).toBe("SECTION");
  });

  it("merges extra class names", () => {
    render(<Card className="w-full">Balance</Card>);
    expect(screen.getByText("Balance")).toHaveClass("card", "w-full");
  });
});
