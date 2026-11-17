"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input, SuccessState } from "@/components/ui";
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

export interface RegisterFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function RegisterForm({ action }: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  if (state.status === "success") {
    return (
      <SuccessState title="Check your email" action={<Link href="/login" className="auth__link">Go to log in</Link>}>
        {state.message}
      </SuccessState>
    );
  }

  const fields = state.status === "error" ? state.fields : {};
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
      <Input label="Full name" name="fullName" type="text" autoComplete="name" required error={fields.fullName} />
      <Input label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required error={fields.email} />
      <Input
        label="Phone number (optional)"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="Nigerian number, for example 0801 234 5678."
        error={fields.phone}
      />
      <PasswordField name="password" autoComplete="new-password" required hint="At least 10 characters." error={fields.password} />

      <div className="auth__consent">
        <label className="auth__check">
          <input type="checkbox" name="acceptTerms" aria-invalid={fields.acceptTerms ? true : undefined} aria-describedby={fields.acceptTerms ? "terms-error" : undefined} />
          <span>
            I accept the <Link href="/legal/terms" className="auth__link">terms</Link> and the{" "}
            <Link href="/legal/privacy" className="auth__link">privacy policy</Link>.
          </span>
        </label>
        {fields.acceptTerms ? <p id="terms-error" className="auth__consent-error">{fields.acceptTerms}</p> : null}
      </div>

      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="accent" status={pending ? "loading" : "idle"} loadingLabel="Creating your account" trailingIcon={<DoorIcon />}>
          Sign up
        </Button>
      </div>
    </form>
  );
}
