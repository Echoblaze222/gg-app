import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { GoogleSection } from "./GoogleButton";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { MfaForm } from "./MfaForm";
import type { AuthFormState } from "./form-state";

afterEach(cleanup);

describe("LoginForm", () => {
  it("has labelled fields and a Log in button", () => {
    render(<LoginForm action={async () => ({ status: "idle" })} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows and hides the password with a button that reports its state", async () => {
    const user = userEvent.setup();
    render(<LoginForm action={async () => ({ status: "idle" })} />);
    const toggle = screen.getByRole("button", { name: /show password/i });
    await user.click(toggle);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("announces a server error in an alert with its reference and marks the field", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AuthFormState> => ({
      status: "error",
      message: "The email, phone or password is not correct.",
      action: "Check them and try again.",
      reference: "req-77",
      fields: { identifier: "Enter your email address or phone number." },
      attempt: 1,
    }));
    render(<LoginForm action={action} />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not correct");
    expect(alert).toHaveTextContent("req-77");
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"));
  });
});

describe("RegisterForm", () => {
  it("has every field, the terms checkbox and a Sign up button", () => {
    render(<RegisterForm action={async () => ({ status: "idle" })} />);
    for (const label of ["Full name", "Email", "Phone number (optional)", "Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: /accept the terms/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("replaces the form with the server's message only after the server says success", async () => {
    const user = userEvent.setup();
    render(<RegisterForm action={async () => ({ status: "success", message: "We sent a verification message to ada@example.com." })} />);
    expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to log in" })).toHaveAttribute("href", "/login");
  });
});

describe("GoogleSection", () => {
  it("offers Continue with Google and shows the server's error in an alert", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: "error", message: "The service is temporarily unavailable.", reference: "req-g", fields: {}, attempt: 1 }));
    render(<GoogleSection action={action} />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("req-g");
  });
});

describe("ForgotPasswordForm", () => {
  it("shows the server's message after the request and a way back", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm action={async () => ({ status: "success", message: "If an account exists for ada@example.com, we sent a link." })} />);
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });
});

describe("ResetPasswordForm", () => {
  it("sends the token in a hidden field and has two password fields", () => {
    const { container } = render(<ResetPasswordForm action={async () => ({ status: "idle" })} token="tok-1" />);
    expect(container.querySelector('input[name="token"]')).toHaveAttribute("value", "tok-1");
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("type", "password");
  });

  it("offers a new link when the server says the link is no good", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="old" action={async () => ({ status: "error", message: "This reset link has expired or was already used.", fields: {}, attempt: 1 })} />);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("MfaForm", () => {
  it("is a numeric one time code field that the phone can autofill", () => {
    render(<MfaForm action={async () => ({ status: "idle" })} />);
    const field = screen.getByLabelText("6 digit code");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
    expect(field).toHaveAttribute("inputmode", "numeric");
    // No maxlength: a code pasted as "123 456" must not lose a digit. The component strips spaces and keeps six digits.
    expect(field).not.toHaveAttribute("maxlength");
  });
});

describe("MfaForm boxes", () => {
  it("shows typed digits in boxes and accepts a pasted code with a space", async () => {
    const user = userEvent.setup();
    const { container } = render(<MfaForm action={async () => ({ status: "idle" })} />);
    const field = screen.getByLabelText("6 digit code") as HTMLInputElement;
    await user.click(field);
    await user.paste("123 456");
    expect(field.value).toBe("123456");
    expect(Array.from(container.querySelectorAll(".otp__digit")).map((d) => d.textContent).join("")).toBe("123456");
  });

  it("submits by itself when the sixth digit is in", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AuthFormState> => ({ status: "idle" }));
    render(<MfaForm action={action} />);
    await user.type(screen.getByLabelText("6 digit code"), "123456");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
});
