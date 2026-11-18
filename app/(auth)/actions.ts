"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/contracts/errors";
import { emailSchema, loginInputSchema, otpSchema, passwordSchema, registerInputSchema } from "@/contracts/schemas";
import { buildRequestContext, getAuthService, getCurrentPolicyVersionIds, getGoogleAuthUrl } from "./auth-gateway";
import { fieldErrorsFromIssues, stateFromError, validationState, type AuthFormState } from "./form-state";

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

const attemptOf = (prev: AuthFormState) => (prev.status === "error" ? prev.attempt + 1 : 1);

const LOGIN_FRIENDLY = {
  identifier: "Enter the email address you signed up with.",
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
  const auth = await getAuthService();
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
  const auth = await getAuthService();
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

const unavailable = async (attempt: number) => {
  const ctx = await buildRequestContext();
  return stateFromError(new AppError("SYSTEM_UNAVAILABLE", { reference: ctx.requestId }).toShape(), attempt);
};

export async function googleAction(prev: AuthFormState): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const ctx = await buildRequestContext();
  const url = await getGoogleAuthUrl(ctx);
  if (!url) return unavailable(attempt);
  redirect(url);
}

export async function forgotPasswordAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const email = emailSchema.safeParse(text(formData, "email"));
  if (!email.success) return validationState({ email: "Enter the email address you signed up with." }, attempt);

  const ctx = await buildRequestContext();
  const auth = await getAuthService();
  if (!auth) return unavailable(attempt);

  const result = await auth.requestPasswordReset(ctx, { identifier: email.data });
  if (!result.ok) return stateFromError(result.error, attempt);
  // Same words whether or not an account exists, so this form cannot be used to find out who has one.
  return { status: "success", message: `If an account exists for ${email.data}, we sent a link to reset the password. It can take a few minutes.` };
}

export async function resetPasswordAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const token = text(formData, "token");
  const password = passwordSchema.safeParse(text(formData, "password"));
  const fields: Record<string, string> = {};
  if (!password.success) fields.password = "Use at least 10 characters.";
  else if (text(formData, "confirm") !== password.data) fields.confirm = "The passwords do not match.";
  if (Object.keys(fields).length > 0) return validationState(fields, attempt);
  if (!password.success) return validationState(fields, attempt);

  const ctx = await buildRequestContext();
  const auth = await getAuthService();
  if (!auth) return unavailable(attempt);

  const result = await auth.resetPassword(ctx, { token, newPassword: password.data });
  if (!result.ok) return stateFromError(result.error, attempt);
  return { status: "success", message: "Your password was changed and you were signed out everywhere. Log in with the new password." };
}

export async function mfaAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const attempt = attemptOf(prev);
  const code = otpSchema.safeParse(text(formData, "code").replace(/\s/g, ""));
  if (!code.success) return validationState({ code: "Enter the 6 digit code." }, attempt);

  const ctx = await buildRequestContext();
  const auth = await getAuthService();
  if (!auth) return unavailable(attempt);

  const result = await auth.verifyMfa(ctx, { code: code.data });
  if (!result.ok) return stateFromError(result.error, attempt);
  redirect("/app");
}
