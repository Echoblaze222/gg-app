import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshButton } from "./RefreshButton";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("RefreshButton", () => {
  it("refreshes the route when pressed", async () => {
    const user = userEvent.setup();
    render(<RefreshButton />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the label it is given", () => {
    render(<RefreshButton>Reload numbers</RefreshButton>);
    expect(screen.getByRole("button", { name: "Reload numbers" })).toBeInTheDocument();
  });
});
