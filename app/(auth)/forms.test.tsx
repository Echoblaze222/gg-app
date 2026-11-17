import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import type { AuthFormState } from "./form-state";

afterEach(cleanup);

describe("LoginForm", () => {
  it("has labelled fields and a Log in button", () => {
    render(<LoginForm action={async () => ({ status: "idle" })} />);
    expect(screen.getByLabelText("Email or phone number")).toBeInTheDocument();
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
    await user.type(screen.getByLabelText("Email or phone number"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("not correct");
    expect(alert).toHaveTextContent("req-77");
    await waitFor(() => expect(screen.getByLabelText("Email or phone number")).toHaveAttribute("aria-invalid", "true"));
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
