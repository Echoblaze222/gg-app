import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { ForgotPasswordForm } from "../ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password | GG Contribution", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset password" backHref="/login" subtitle={<>Enter your email and we will send a link. Remembered it? <Link href="/login" className="auth__link">Log in</Link></>}>
      <ForgotPasswordForm action={forgotPasswordAction} />
    </AuthShell>
  );
}
