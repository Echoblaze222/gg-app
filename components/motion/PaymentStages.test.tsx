import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentStages, type PaymentStageState } from "./PaymentStages";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const animationEnd = (el: Element, animationName: string) => {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  fireEvent(el, ev);
};

describe("PaymentStages", () => {
  const stages: [PaymentStageState, string][] = [
    ["initiating", "Starting your payment."],
    ["awaiting_auth", "Waiting for your bank to approve this payment."],
    ["processing", "Processing your payment."],
    ["verifying", "Confirming your payment with Paystack."],
    ["successful", "Payment confirmed."],
    ["cancelled", "Payment cancelled."],
    ["expired", "This payment was not completed and has expired."],
  ];

  it.each(stages)("%s has a text status as well as the drawing", (state, text) => {
    const { container } = render(<PaymentStages state={state} />);
    expect(container.querySelector(".pay")).toHaveAttribute("data-state", state);
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(container.querySelector(".pay__scene")).toHaveAttribute("aria-hidden", "true");
  });

  it("announces nothing while idle", () => {
    render(<PaymentStages state="idle" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows the server's failure message, the next step and whether money moved", () => {
    const { container } = render(
      <PaymentStages state="failed" failure={{ message: "The payment was declined. You were not charged.", action: "Try another card or payment method.", moneyMoved: "no" }} />,
    );
    expect(screen.getAllByText("The payment was declined. You were not charged.").length).toBeGreaterThan(0);
    expect(screen.getByText("Try another card or payment method.")).toBeInTheDocument();
    expect(screen.getByText("No money moved.")).toBeInTheDocument();
    expect(container.querySelector(".pay")).toHaveAttribute("data-money", "no");
  });

  it("warns that money may have moved when the server is not sure, and never says nothing was charged", () => {
    render(<PaymentStages state="failed" failure={{ message: "We are waiting for confirmation from the payment provider.", moneyMoved: "unknown" }} />);
    expect(screen.getByText(/Money may have moved/)).toBeInTheDocument();
    expect(screen.queryByText("No money moved.")).not.toBeInTheDocument();
  });

  it("defaults to the cautious wording when a failure has no details", () => {
    render(<PaymentStages state="failed" />);
    expect(screen.getAllByText(/whether any money moved/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Money may have moved/)).toBeInTheDocument();
  });

  it("shows only the success words for the successful state", () => {
    const { rerender } = render(<PaymentStages state="verifying" />);
    expect(screen.queryByText("Payment confirmed.")).not.toBeInTheDocument();
    rerender(<PaymentStages state="successful" />);
    expect(screen.getAllByText("Payment confirmed.").length).toBeGreaterThan(0);
  });

  it("when taking long, shows the notify text and the elapsed time, not a spinner", () => {
    const { container } = render(<PaymentStages state="pending_long" elapsedLabel="Waiting for 2 minutes" />);
    expect(screen.getAllByText(/We will notify you/).length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting for 2 minutes")).toBeInTheDocument();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("does not announce the elapsed time, so a screen reader is not interrupted every second", () => {
    const { rerender } = render(<PaymentStages state="pending_long" elapsedLabel="Waiting for 1 minute" />);
    const before = screen.getByRole("status").textContent;
    rerender(<PaymentStages state="pending_long" elapsedLabel="Waiting for 2 minutes" />);
    expect(screen.getByRole("status").textContent).toBe(before);
  });

  it("calls onSettled once, after the check finishes drawing", () => {
    const onSettled = vi.fn();
    const { container } = render(<PaymentStages state="successful" onSettled={onSettled} />);
    const check = container.querySelector(".pay__check")!;
    animationEnd(check, "pay-stamp");
    expect(onSettled).not.toHaveBeenCalled();
    animationEnd(check, "pay-check");
    animationEnd(check, "pay-check");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion, hands over at once when the payment is successful", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const onSettled = vi.fn();
    render(<PaymentStages state="successful" onSettled={onSettled} />);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("never hands over for any state but successful", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const onSettled = vi.fn();
    render(<PaymentStages state="verifying" onSettled={onSettled} />);
    expect(onSettled).not.toHaveBeenCalled();
  });
});
