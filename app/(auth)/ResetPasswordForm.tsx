"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, SuccessState } from "@/components/ui";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";
import { PasswordField } from "./PasswordField";

export interface ResetPasswordFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
  /** The one time token from the emailed link. Checked by the server, never trusted here. */
  token: string;
}

export function ResetPasswordForm({ action, token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  if (state.status === "success") {
    return (
      <SuccessState title="Password changed" action={<Link href="/login" className="auth__link">Log in</Link>}>
        {state.message}
      </SuccessState>
    );
  }

  const fields = state.status === "error" ? state.fields : {};
  const linkExpired = state.status === "error" && state.message.toLowerCase().includes("reset link");
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
      {linkExpired ? <Link href="/forgot-password" className="auth__link">Ask for a new link</Link> : null}
      <input type="hidden" name="token" value={token} />
      <PasswordField label="New password" name="password" autoComplete="new-password" required hint="At least 10 characters." error={fields.password} />
      <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" required error={fields.confirm} />
      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="primary" status={pending ? "loading" : "idle"} loadingLabel="Changing the password">
          Change password
        </Button>
      </div>
    </form>
  );
}
