"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { FormAlert } from "./FormAlert";
import { IDLE, type AuthFormState } from "./form-state";

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export interface GoogleButtonProps {
  action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>;
}

/** "Or" divider plus the Google button. Its own form, because forms cannot be nested. Works for sign in and sign up. */
export function GoogleSection({ action }: GoogleButtonProps) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <section aria-label="Continue with Google" className="auth__social">
      <p className="auth__divider" aria-hidden="true"><span>or</span></p>
      <form action={formAction} className="auth__form">
        <FormAlert state={state} />
        <Button type="submit" size="lg" variant="secondary" leadingIcon={<GoogleMark />} status={pending ? "loading" : "idle"} loadingLabel="Opening Google" className="auth__google">
          Continue with Google
        </Button>
      </form>
    </section>
  );
}
