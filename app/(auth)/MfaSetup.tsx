"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button, Input, SuccessState } from "@/components/ui";
import { confirmMfaEnrolAction, startMfaEnrolAction, type MfaSetupState } from "./mfa/setup/actions";

const IDLE_STATE: MfaSetupState = { status: "idle" };

export function MfaSetup() {
  const [started, setStarted] = useState<MfaSetupState>(IDLE_STATE);
  const [starting, startTransition] = useTransition();
  const [confirmed, confirmAction, confirming] = useActionState(confirmMfaEnrolAction, IDLE_STATE);

  if (confirmed.status === "done") {
    return (
      <SuccessState title="Authenticator app is on" action={<Link href="/app" className="auth__link">Continue</Link>}>
        From now on, logging in asks for a code from the app.
      </SuccessState>
    );
  }

  const failure = confirmed.status === "error" ? confirmed : started.status === "error" ? started : null;
  const alert = failure ? (
    <Alert tone="error" title={failure.message}>
      <span className="auth__ref">Reference: {failure.reference}</span>
    </Alert>
  ) : null;

  if (started.status !== "ready") {
    return (
      <div className="auth__form">
        {alert}
        <p>Install an authenticator app such as Google Authenticator or Microsoft Authenticator. Then scan the code we show you.</p>
        <div className="auth__row auth__row--end">
          <Button
            type="button"
            size="lg"
            variant="accent"
            status={starting ? "loading" : "idle"}
            loadingLabel="Preparing your code"
            onClick={() => startTransition(async () => setStarted(await startMfaEnrolAction()))}
          >
            Start setup
          </Button>
        </div>
      </div>
    );
  }

  // The QR code is SVG from the auth provider. It goes in an image source, where scripts never run, never into the page as markup.
  const qrSource = `data:image/svg+xml;utf8,${encodeURIComponent(started.qrSvg)}`;
  return (
    <form action={confirmAction} noValidate className="auth__form">
      {alert}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSource} alt="QR code to add GG Contribution to your authenticator app" width={192} height={192} />
      <p>Cannot scan it? In the app, choose to enter a key and type this one: <code>{started.secret}</code></p>
      <input type="hidden" name="factorId" value={started.factorId} />
      <Input
        className="auth__otp"
        label="6 digit code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        required
      />
      <div className="auth__row auth__row--end">
        <Button type="submit" size="lg" variant="accent" status={confirming ? "loading" : "idle"} loadingLabel="Checking the code">
          Turn on
        </Button>
      </div>
    </form>
  );
}
