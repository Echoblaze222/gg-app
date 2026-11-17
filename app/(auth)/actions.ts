"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/contracts/errors";
import { loginInputSchema, registerInputSchema } from "@/contracts/schemas";
import { buildRequestContext, getAuthService, getCurrentPolicyVersionIds } from "./auth-gateway";
import { fieldErrorsFromIssues, stateFromError, validationState, type AuthFormState } from "./form-state";

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

const attemptOf = (prev: AuthFormState) => (prev.status === "error" ? prev.attempt + 1 : 1);

const LOGIN_FRIENDLY = {
  identifier: "Enter your email address or phone number.",
  password: "Enter your password.",
};

const REGISTER_FRIENDLY = {
  fullName: "Enter your full name.",
  email: "Enter a valid email address.",
  phone: "Enter a valid Nigerian phone number, for example 0801 234 5678.",
  password: "Use at least 10 characters.",
};

export async function loginAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const parsed = loginInputSchema.safeParse({ identifier: text(formData, "identifier"), password: text(formData, "password") });
  if (!parsed.success) return validationState(fieldErrorsFromIssues(parsed.error.issues, LOGIN_FRIENDLY), attempt);

  const ctx = await buildRequestContext();
  const auth = getAuthService();
  if (!auth) return stateFromError(new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape(), attempt);

  const result = await auth.login(ctx, parsed.data);
  if (!result.ok) return stateFromError(result.error, attempt);
  // redirect() throws on purpose, so it stays outside any try block.
  redirect(result.value.mfaRequired ? "/mfa" : "/app");
}

export async function registerAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const phone = text(formData, "phone").trim();
  const policyIds = await getCurrentPolicyVersionIds();
  // The policy versions are chosen on the server below, never read from the form.
  const parsed = registerInputSchema.omit({ acceptedPolicyVersionIds: true }).safeParse({
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    phone: phone === "" ? undefined : phone,
    password: text(formData, "password"),
  });
  const fields: Record<string, string> = parsed.success ? {} : fieldErrorsFromIssues(parsed.error.issues, REGISTER_FRIENDLY);
  if (text(formData, "acceptTerms") !== "on") fields.acceptTerms = "Please accept the terms and the privacy policy to continue.";
  if (Object.keys(fields).length > 0 || !parsed.success) return validationState(fields, attempt);

  const ctx = await buildRequestContext();
  const auth = getAuthService();
  if (!auth || policyIds.length === 0) {
    return stateFromError(new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape(), attempt);
  }

  const result = await auth.register(ctx, { ...parsed.data, acceptedPolicyVersionIds: policyIds });
  if (!result.ok) return stateFromError(result.error, attempt);
  return {
    status: "success",
    message: result.value.verificationSent
      ? `We sent a verification message to ${parsed.data.email}. Open it to confirm your account.`
      : "Your account was created. Verification could not be sent yet, so sign in later or ask for a new message.",
  };
}
