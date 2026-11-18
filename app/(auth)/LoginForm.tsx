"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";
import { PasswordField } from "./PasswordField";

function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8M11 6.5L14.5 10 11 13.5M14.5 10H7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface LoginFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function LoginForm({ action }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fields = state.status === "error" ? state.fields : {};
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
      <Input
        label="Email"
        name="identifier"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fields.identifier}
      />
      <PasswordField name="password" autoComplete="current-password" required error={fields.password} />
      <div className="auth__row">
        <Link href="/forgot-password" className="auth__link">Forgot password?</Link>
        <Button type="submit" size="lg" variant="primary" status={pending ? "loading" : "idle"} loadingLabel="Signing in" trailingIcon={<DoorIcon />}>
          Log in
        </Button>
      </div>
    </form>
  );
}
