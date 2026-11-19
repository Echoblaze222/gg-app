import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

afterEach(cleanup);

describe("Input", () => {
  it("connects a real label to the field", () => {
    render(<Input label="Email" name="email" />);
    const field = screen.getByLabelText("Email");
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("name", "email");
  });

  it("uses a single space placeholder so the label can float without script", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("placeholder", " ");
  });

  it("keeps the label after the input so CSS sibling selectors can float it", () => {
    const { container } = render(<Input label="Email" />);
    const input = container.querySelector("input")!;
    expect(input.nextElementSibling?.tagName).toBe("LABEL");
  });

  it("accepts typing and calls onChange", async () => {
    const onChange = vi.fn();
    render(<Input label="Email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Email"), "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Email")).toHaveValue("ab");
  });

  it("passes type, autocomplete, inputMode and ref through", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} label="Phone" type="tel" autoComplete="tel-national" inputMode="tel" />);
    const field = screen.getByLabelText("Phone");
    expect(field).toHaveAttribute("type", "tel");
    expect(field).toHaveAttribute("autocomplete", "tel-national");
    expect(field).toHaveAttribute("inputmode", "tel");
    expect(ref.current).toBe(field);
  });

  it("links the hint with aria-describedby", () => {
    render(<Input label="Amount" hint="Between 1,000 and 500,000" />);
    const field = screen.getByLabelText("Amount");
    expect(field).toHaveAccessibleDescription("Between 1,000 and 500,000");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  describe("error", () => {
    it("marks the field invalid and links the message", () => {
      render(<Input label="Email" error="Enter an email like name@example.com" hint="We never share it" />);
      const field = screen.getByLabelText("Email");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription("Enter an email like name@example.com We never share it");
    });

    it("announces the error politely", () => {
      render(<Input label="Email" error="Enter an email like name@example.com" />);
      expect(screen.getByRole("status")).toHaveTextContent("Enter an email like name@example.com");
    });

    it("announces nothing when there is no error", () => {
      render(<Input label="Email" />);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("shows an icon so color is not the only signal", () => {
      const { container } = render(<Input label="Email" error="Required" />);
      expect(container.querySelector(".field__message--error svg")).not.toBeNull();
    });

    it("keeps any caller supplied aria-describedby", () => {
      render(<Input label="Email" error="Required" aria-describedby="extra" />);
      expect(screen.getByLabelText("Email").getAttribute("aria-describedby")).toMatch(/error.*extra|extra/);
    });
  });

  it("disables the native input", async () => {
    const onChange = vi.fn();
    render(<Input label="Email" disabled onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Email"), "x");
    expect(screen.getByLabelText("Email")).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a prefix and a trailing control", () => {
    const { container } = render(<Input label="Phone" prefix="+234" trailing={<button type="button">Show</button>} />);
    expect(screen.getByText("+234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
    expect(container.querySelector(".field__control")).toHaveAttribute("data-has-prefix", "true");
  });

  it("gives two fields different ids", () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>,
    );
    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });
});
