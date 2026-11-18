import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { googleAction, loginAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { GoogleSection } from "../GoogleButton";
import { LoginForm } from "../LoginForm";

export const metadata: Metadata = { title: "Log in | GG Contribution", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; google?: string }> }) {
  const { verified, google } = await searchParams;
  return (
    <AuthShell title="Log in" subtitle={<>New here? <Link href="/register" className="auth__link">Create an account</Link></>}>
      {verified === "1" ? <Alert tone="success" title="Email confirmed">Log in to continue.</Alert> : null}
      {verified === "failed" ? (
        <Alert tone="warning" title="That link did not work">It may have expired or been used already. If you can log in, your email is already confirmed.</Alert>
      ) : null}
      {google === "failed" ? <Alert tone="error" title="Google sign in did not work">Try again, or log in with your email and password.</Alert> : null}
      <LoginForm action={loginAction} />
      <GoogleSection action={googleAction} />
    </AuthShell>
  );
}
