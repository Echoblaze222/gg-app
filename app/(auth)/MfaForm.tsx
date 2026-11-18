"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";

export interface MfaFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function MfaForm({ action }: MfaFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fields = state.status === "error" ? state.fields : {};
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
      <Input
        className="auth__otp"
        label="6 digit code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        required
        error={fields.code}
      />
      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="primary" status={pending ? "loading" : "idle"} loadingLabel="Checking the code">
          Verify
        </Button>
      </div>
    </form>
  );
}
