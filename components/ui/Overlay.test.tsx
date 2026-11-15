import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal, Sheet } from "./Overlay";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <div>
      <button type="button">Opener</button>
      <Modal open onClose={onClose} title="Confirm payment" footer={<button type="button">Pay now</button>} {...props}>
        <input aria-label="Amount" />
      </Modal>
    </div>,
  );
  return { onClose };
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Closed" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog and moves focus inside", () => {
    setup({ description: "You will be charged NGN 5,000." });
    const dialog = screen.getByRole("dialog", { name: "Confirm payment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("You will be charged NGN 5,000.");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape, the close button and the backdrop", async () => {
    const { onClose } = setup();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps focus inside while tabbing in both directions", async () => {
    setup();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("cannot be dismissed while busy and announces the busy label", async () => {
    const { onClose } = setup({ busy: true, busyLabel: "Confirming your payment" });
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Confirming your payment");
  });

  it("locks page scroll while open and gives focus back on close", () => {
    const { rerender } = render(
      <div>
        <button type="button">Opener</button>
        <Modal open={false} onClose={() => {}} title="Test" />
      </div>,
    );
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();
    rerender(
      <div>
        <button type="button">Opener</button>
        <Modal open onClose={() => {}} title="Test" />
      </div>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <div>
        <button type="button">Opener</button>
        <Modal open={false} onClose={() => {}} title="Test" />
      </div>,
    );
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });
});

describe("Sheet", () => {
  it("renders as a dialog with a grabber on the bottom and a side variant", () => {
    const { container, rerender } = render(<Sheet open onClose={() => {}} title="Menu" />);
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(document.body.querySelector(".overlay--bottom")).not.toBeNull();
    expect(document.body.querySelector(".overlay__grabber")).not.toBeNull();
    rerender(<Sheet open onClose={() => {}} title="Menu" side="end" />);
    expect(document.body.querySelector(".overlay--end")).not.toBeNull();
    expect(container).toBeDefined();
  });
});
