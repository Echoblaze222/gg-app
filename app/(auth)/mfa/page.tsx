import type { Metadata } from "next";
import { mfaAction } from "../actions";
import { AuthShell } from "../AuthShell";
import { MfaForm } from "../MfaForm";

export const metadata: Metadata = { title: "Enter your code | GG Contribution", robots: { index: false } };

export default function MfaPage() {
  return (
    <AuthShell title="Enter your code" backHref="/login" subtitle="Type the 6 digit code from your authenticator app.">
      <MfaForm action={mfaAction} />
    </AuthShell>
  );
}
