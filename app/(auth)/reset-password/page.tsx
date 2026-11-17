import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/ui";
import { resetPasswordAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { ResetPasswordForm } from "../ResetPasswordForm";

// The link carries a one time token, so the page must not leak it through the Referer header.
export const metadata: Metadata = { title: "Choose a new password | GG Contribution", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  return (
    <AuthShell title="New password" backHref="/login" subtitle="Choose a new password for your account.">
      {value ? (
        <ResetPasswordForm action={resetPasswordAction} token={value} />
      ) : (
        <ErrorState title="This reset link is not complete" action={<Link href="/forgot-password" className="auth__link">Ask for a new link</Link>}>
          Open the link from your email again, or ask for a new one.
        </ErrorState>
      )}
    </AuthShell>
  );
}
