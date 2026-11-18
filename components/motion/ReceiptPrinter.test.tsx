import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptPrinter, type ReceiptPrinterProps } from "./ReceiptPrinter";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base: ReceiptPrinterProps = {
  state: "printing",
  verified: true,
  amount: "NGN 5,000.00",
  reference: "GGC-2026-000123",
  lines: [
    { label: "Plan", value: "Monthly" },
    { label: "Paid on", value: "17 Nov 2026" },
  ],
};

const animationEnd = (el: Element, animationName: string) => {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  fireEvent(el, ev);
};

const reducedMotion = (matches: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
};

describe("ReceiptPrinter", () => {
  it("prints the details it is given and says what it is doing in words", () => {
    render(<ReceiptPrinter {...base} />);
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("NGN 5,000.00")).toBeInTheDocument();
    expect(screen.getByText("GGC-2026-000123")).toBeInTheDocument();
    expect(screen.getAllByText("Printing your receipt.").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("Printing your receipt.");
  });

  it("draws the Verified stamp only when the server verified the payment", () => {
    const { rerender, container } = render(<ReceiptPrinter {...base} state="printed" verified={false} />);
    expect(container.querySelector(".printer__stamp")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Your receipt is ready.");
    rerender(<ReceiptPrinter {...base} state="printed" verified />);
    expect(container.querySelector(".printer__stamp")).toHaveTextContent("Verified");
    expect(screen.getByRole("status")).toHaveTextContent("the payment is verified");
  });

  it("announces nothing while idle", () => {
    render(<ReceiptPrinter {...base} state="idle" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows a calm jam with a Retry button that does not claim anything about the payment changing", () => {
    const onRetry = vi.fn();
    const { container } = render(<ReceiptPrinter {...base} state="failed" onRetry={onRetry} />);
    expect(container.querySelector(".printer")).toHaveAttribute("data-state", "failed");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("does not change your payment");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onPrinted once, after the detach animation ends", () => {
    const onPrinted = vi.fn();
    const { container } = render(<ReceiptPrinter {...base} onPrinted={onPrinted} />);
    const paper = container.querySelector(".printer__paper")!;
    animationEnd(paper, "printer-feed");
    expect(onPrinted).not.toHaveBeenCalled();
    animationEnd(paper, "printer-detach");
    animationEnd(paper, "printer-detach");
    expect(onPrinted).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion, finishes at once because no animation will run", () => {
    reducedMotion(true);
    const onPrinted = vi.fn();
    render(<ReceiptPrinter {...base} onPrinted={onPrinted} />);
    expect(onPrinted).toHaveBeenCalledTimes(1);
  });

  it("shows the finished receipt with its actions straight away when instant, and offers Replay", () => {
    const onReplay = vi.fn();
    const { container } = render(
      <ReceiptPrinter {...base} state="printed" instant onReplay={onReplay}>
        <button type="button">Download</button>
      </ReceiptPrinter>,
    );
    expect(container.querySelector(".printer")).toHaveAttribute("data-instant", "true");
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Replay" }).click());
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("keeps the action buttons away until the receipt is finished", () => {
    render(
      <ReceiptPrinter {...base}>
        <button type="button">Download</button>
      </ReceiptPrinter>,
    );
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("hides the drawing from screen readers so only the text status is read", () => {
    const { container } = render(<ReceiptPrinter {...base} />);
    expect(container.querySelector(".printer__stage")).toHaveAttribute("aria-hidden", "true");
  });
});
