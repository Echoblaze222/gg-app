import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OfflineNotice } from "./OfflineNotice";

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
});

afterEach(() => {
  cleanup();
  // Removes the own property again so the real getter from the prototype is back.
  delete (window.navigator as { onLine?: boolean }).onLine;
});

describe("OfflineNotice", () => {
  it("renders nothing while online", () => {
    const { container } = render(<OfflineNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the notice when the device starts offline", () => {
    online = false;
    render(<OfflineNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("You are offline");
  });

  it("appears when the connection drops and disappears when it returns", () => {
    render(<OfflineNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("last data that loaded");

    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("never prints an em dash", () => {
    online = false;
    const { container } = render(<OfflineNotice />);
    expect(container.textContent ?? "").not.toContain("\u2014");
  });
});
