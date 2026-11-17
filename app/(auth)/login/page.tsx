import type { Metadata } from "next";
import Link from "next/link";
import { googleAction, loginAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { GoogleSection } from "../GoogleButton";
import { LoginForm } from "../LoginForm";

export const metadata: Metadata = { title: "Log in | GG Contribution", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthShell title="Log in" subtitle={<>New here? <Link href="/register" className="auth__link">Create an account</Link></>}>
      <LoginForm action={loginAction} />
      <GoogleSection action={googleAction} />
    </AuthShell>
  );
}
