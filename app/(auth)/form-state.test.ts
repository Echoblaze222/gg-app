import { describe, expect, it } from "vitest";
import { AppError } from "@/contracts/errors";
import { fieldErrorsFromIssues, stateFromError, validationState } from "./form-state";

describe("fieldErrorsFromIssues", () => {
  it("keeps the first message per field and swaps in the friendly text", () => {
    const out = fieldErrorsFromIssues(
      [
        { path: ["email"], message: "Invalid email" },
        { path: ["email"], message: "Too long" },
        { path: ["password"], message: "Too small" },
      ],
      { email: "Enter a valid email address." },
    );
    expect(out).toEqual({ email: "Enter a valid email address.", password: "Too small" });
  });
});

describe("stateFromError", () => {
  it("carries the message, the next step and the reference, and has no field for a password value", () => {
    const shape = new AppError("AUTH_INVALID_CREDENTIALS", { reference: "req-1" }).toShape();
    const state = stateFromError(shape, 2);
    expect(state).toMatchObject({ status: "error", reference: "req-1", attempt: 2 });
    expect(Object.keys(state)).not.toContain("password");
  });
});

describe("validationState", () => {
  it("is an error state with the field messages", () => {
    expect(validationState({ email: "x" }, 1)).toMatchObject({ status: "error", fields: { email: "x" }, attempt: 1 });
  });
});
