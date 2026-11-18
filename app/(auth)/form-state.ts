import type { AppErrorShape } from "@/contracts/errors";

/** What a form shows after the server answered. Never contains the password the person typed. */
export type AuthFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      /** What the person can do next. */
      action?: string;
      /** Correlation id the person can quote to support. */
      reference?: string;
      fields: Readonly<Record<string, string>>;
      /** Changes on every failure so the shake plays again even when the message is the same. */
      attempt: number;
    }
  | { status: "success"; message: string };

export const IDLE: AuthFormState = { status: "idle" };

interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

/** First message per field. Zod messages are replaced where they would read badly for a person. */
export function fieldErrorsFromIssues(issues: readonly IssueLike[], friendly: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = friendly[key] ?? issue.message;
  }
  return out;
}

export function stateFromError(error: AppErrorShape, attempt: number): AuthFormState {
  return {
    status: "error",
    message: error.message,
    action: error.action,
    reference: error.reference,
    fields: error.fields ?? {},
    attempt,
  };
}

export function validationState(fields: Record<string, string>, attempt: number): AuthFormState {
  return {
    status: "error",
    message: "Some details are missing or not valid.",
    action: "Check the fields marked below and try again.",
    fields,
    attempt,
  };
}
