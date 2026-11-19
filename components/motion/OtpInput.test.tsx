import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtpInput } from "./OtpInput";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const animationEnd = (el: Element, animationName: string) => {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  fireEvent(el, ev);
};

const reduced = () =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));

describe("OtpInput", () => {
  it("is one labelled numeric field the phone can autofill, with decorative boxes", () => {
    const { container } = render(<OtpInput label="6 digit code" />);
    const field = screen.getByLabelText("6 digit code");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(container.querySelectorAll(".otp__box")).toHaveLength(6);
    expect(container.querySelector(".otp__boxes")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows typed digits in the boxes and keeps digits only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<OtpInput label="Code" onChange={onChange} />);
    await user.type(screen.getByLabelText("Code"), "1a2-3");
    expect(onChange).toHaveBeenLastCalledWith("123");
    expect(Array.from(container.querySelectorAll(".otp__digit")).map((d) => d.textContent).join("")).toBe("123");
    expect(container.querySelectorAll('.otp__box[data-filled="true"]')).toHaveLength(3);
  });

  it("accepts a pasted code with a space and calls onComplete once all digits are in", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput label="Code" onComplete={onComplete} />);
    await user.click(screen.getByLabelText("Code"));
    await user.paste("123 456");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("does not take more digits than the length", async () => {
    const user = userEvent.setup();
    render(<OtpInput label="Code" length={4} />);
    await user.type(screen.getByLabelText("Code"), "123456");
    expect((screen.getByLabelText("Code") as HTMLInputElement).value).toBe("1234");
  });

  it("locks the field while verifying and says so in words", () => {
    render(<OtpInput label="Code" state="verifying" />);
    expect(screen.getByLabelText("Code")).toHaveAttribute("readonly");
    expect(screen.getByRole("status")).toHaveTextContent("Checking the code.");
  });

  it("shows the server's message on error and marks the field", () => {
    render(<OtpInput label="Code" state="error" error="That code is not correct." />);
    const field = screen.getByLabelText("Code");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("That code is not correct.");
    expect(screen.getByRole("status")).toHaveTextContent("That code is not correct.");
  });

  it("announces nothing while idle", () => {
    render(<OtpInput label="Code" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("calls onSettled once, after the success check has drawn", () => {
    const onSettled = vi.fn();
    const { container } = render(<OtpInput label="Code" state="success" onSettled={onSettled} />);
    const check = container.querySelector(".otp__check")!;
    animationEnd(check, "otp-merge");
    expect(onSettled).not.toHaveBeenCalled();
    animationEnd(check, "otp-check");
    animationEnd(check, "otp-check");
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Code accepted.");
  });

  it("with reduced motion, settles at once on success and never for other states", () => {
    reduced();
    const onSettled = vi.fn();
    const { rerender } = render(<OtpInput label="Code" state="verifying" onSettled={onSettled} />);
    expect(onSettled).not.toHaveBeenCalled();
    rerender(<OtpInput label="Code" state="success" onSettled={onSettled} />);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
