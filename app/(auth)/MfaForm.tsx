"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui";
import { OtpInput, type OtpState } from "@/components/motion/OtpInput";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";

export interface MfaFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function MfaForm({ action }: MfaFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);
  const fields = state.status === "error" ? state.fields : {};
  // Success is a redirect to the app, so the form only ever shows checking or error.
  const otpState: OtpState = pending ? "verifying" : state.status === "error" ? "error" : "idle";
  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="auth__form"
      key={state.status === "error" ? state.attempt : 0}
    >
      <FormAlert state={state} />
      <OtpInput
        label="6 digit code"
        name="code"
        state={otpState}
        error={fields.code}
        autoFocus
        onComplete={() => {
          if (!pending) formRef.current?.requestSubmit();
        }}
      />
      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="primary" status={pending ? "loading" : "idle"} loadingLabel="Checking the code">
          Verify
        </Button>
      </div>
    </form>
  );
}
