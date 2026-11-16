import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

/*
 * jsdom has no showModal() or close(). These stand in for the browser: showModal opens and marks the dialog modal,
 * close() fires the "close" event like a browser does. Real focus trapping, Escape and focus return are the browser's job
 * and are NOT verified here (docs/design/decisions/004-dialog-native.md).
 */
type DialogProto = { showModal?: () => void; close?: () => void };
const proto = Object.getPrototypeOf(document.createElement("dialog")) as DialogProto;
const original = { showModal: proto.showModal, close: proto.close };

function installBrowserStandIn() {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.setAttribute("data-modal", "true");
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

/** What a browser does on Escape: fire cancel, and close unless it was prevented. */
function pressEscape(dialog: HTMLElement) {
  const cancel = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(cancel);
  if (!cancel.defaultPrevented) (dialog as HTMLDialogElement).close();
  return cancel;
}

beforeAll(installBrowserStandIn);
afterEach(cleanup);

const setup = (props: Partial<React.ComponentProps<typeof Dialog>> = {}) => {
  const onClose = vi.fn();
  const view = render(
    <Dialog open title="Confirm payment" description="You will pay NGN 5,000." onClose={onClose} {...props}>
      <button type="button">Pay now</button>
    </Dialog>,
  );
  return { onClose, ...view };
};

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(screen.queryByText("Pay now")).toBeNull();
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
  });

  it("opens as a modal with the title as its name and the description", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Confirm payment" });
    expect(dialog).toHaveAttribute("data-modal", "true");
    expect(dialog).toHaveAccessibleDescription("You will pay NGN 5,000.");
    expect(screen.getByRole("button", { name: "Pay now" })).toBeInTheDocument();
  });

  it("closes from the close button", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    pressEscape(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("not dismissible (a payment in flight)", () => {
    it("has no close button", () => {
      setup({ dismissible: false });
      expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    });

    it("blocks Escape and the backdrop", () => {
      const { onClose } = setup({ dismissible: false });
      const dialog = screen.getByRole("dialog");
      const cancel = pressEscape(dialog);
      expect(cancel.defaultPrevented).toBe(true);
      fireEvent.click(dialog);
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog).toHaveAttribute("open");
    });
  });

  it("closes when the parent sets open to false, without calling onClose again", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    rerender(
      <Dialog open={false} title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens again after being closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    rerender(
      <Dialog open={false} title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    rerender(
      <Dialog open title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("locks page scroll while open and releases it after", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <Dialog open title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    expect(document.documentElement).toHaveAttribute("data-scroll-locked", "true");
    rerender(
      <Dialog open={false} title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    expect(document.documentElement).not.toHaveAttribute("data-scroll-locked");
    rerender(
      <Dialog open title="Confirm" onClose={onClose}>
        Body
      </Dialog>,
    );
    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-scroll-locked");
  });

  it("supports the sheet variant", () => {
    setup({ variant: "sheet" });
    expect(screen.getByRole("dialog")).toHaveClass("dialog--sheet");
  });

  it("still shows its content where showModal does not exist", () => {
    proto.showModal = undefined;
    try {
      setup();
      expect(screen.getByRole("dialog")).toHaveAttribute("open");
    } finally {
      installBrowserStandIn();
    }
  });
});

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  installBrowserStandIn();
});
