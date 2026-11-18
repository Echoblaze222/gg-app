import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { acceptTermsAction } from "./actions";
import { AcceptTermsForm } from "./AcceptTermsForm";

export const metadata: Metadata = { title: "One last step | GG Contribution", robots: { index: false } };

export default function AcceptTermsPage() {
  return (
    <AuthShell title="One last step" subtitle="Accept the terms to finish creating your account.">
      <AcceptTermsForm action={acceptTermsAction} />
    </AuthShell>
  );
}
