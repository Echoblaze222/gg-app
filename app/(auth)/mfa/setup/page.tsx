import type { Metadata } from "next";
import { AuthShell } from "../../AuthShell";
import { MfaSetup } from "../../MfaSetup";

export const metadata: Metadata = { title: "Set up your authenticator app | GG Contribution", robots: { index: false } };

export default function MfaSetupPage() {
  return (
    <AuthShell title="Set up your authenticator app" backHref="/app" subtitle="Add a second step to logging in. You need to be logged in to do this.">
      <MfaSetup />
    </AuthShell>
  );
}
