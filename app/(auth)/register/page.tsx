import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { RegisterForm } from "../RegisterForm";

export const metadata: Metadata = { title: "Create account | GG Contribution", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell title="Create account" backHref="/" subtitle={<>Already have an account? <Link href="/login" className="auth__link">Log in</Link></>}>
      <RegisterForm action={registerAction} />
    </AuthShell>
  );
}
