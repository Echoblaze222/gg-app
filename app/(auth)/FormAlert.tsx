import { Alert } from "@/components/ui";
import type { AuthFormState } from "./form-state";

/** Summary of a failed submit. Field messages sit under their own fields. */
export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.status !== "error") return null;
  return (
    <Alert tone="error" title={state.message}>
      {state.action ? <span>{state.action}</span> : null}
      {state.reference ? <span className="auth__ref"> Reference: {state.reference}</span> : null}
    </Alert>
  );
}
