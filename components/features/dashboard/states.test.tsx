import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState, ErrorState } from "./states";

afterEach(cleanup);

describe("dashboard states", () => {
  it("EmptyState explains and offers only the action it is given", () => {
    render(<EmptyState title="No schedule yet">Why it is empty.</EmptyState>);
    expect(screen.getByText("No schedule yet")).toBeInTheDocument();
    expect(screen.getByText("Why it is empty.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ErrorState says what failed, whether money moved, what to do, and the reference", () => {
    render(<ErrorState title="Balance did not load" message="Service down." moneyLine="No money moved." action="Try again." reference="ref-1" retry={<button>Retry</button>} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Balance did not load")).toBeInTheDocument();
    expect(within(alert).getByText(/Service down\. No money moved\. Try again\. Reference ref-1\./)).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("ErrorState without a reference or retry shows neither", () => {
    render(<ErrorState title="Nope" message="Failed." moneyLine="No money moved." action="Try later." />);
    const alert = screen.getByRole("alert");
    expect(within(alert).queryByText(/Reference/)).toBeNull();
    expect(within(alert).queryByRole("button")).toBeNull();
  });
});
