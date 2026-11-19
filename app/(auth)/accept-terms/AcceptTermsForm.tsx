"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { FormAlert } from "../FormAlert";
import { IDLE, type AuthFormState } from "../form-state";

export interface AcceptTermsFormProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

export function AcceptTermsForm({ action }: AcceptTermsFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const fields = state.status === "error" ? state.fields : {};
  return (
    <form action={formAction} noValidate className="auth__form" key={state.status === "error" ? state.attempt : 0} data-failed={state.status === "error" ? "true" : undefined}>
      <FormAlert state={state} />
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
        <Button type="submit" size="lg" variant="accent" status={pending ? "loading" : "idle"} loadingLabel="Saving">
          Continue
        </Button>
      </div>
    </form>
  );
}
