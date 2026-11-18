"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input, SuccessState } from "@/components/ui";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";

export interface ForgotPasswordFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function ForgotPasswordForm({ action }: ForgotPasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  if (state.status === "success") {
    return (
      <SuccessState title="Check your email" action={<Link href="/login" className="auth__link">Back to log in</Link>}>
        {state.message}
      </SuccessState>
    );
  }

  const fields = state.status === "error" ? state.fields : {};
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
      <Input label="Email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required error={fields.email} />
      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="primary" status={pending ? "loading" : "idle"} loadingLabel="Sending the link">
          Send reset link
        </Button>
      </div>
    </form>
  );
}
