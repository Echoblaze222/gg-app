"use client";

import { useState } from "react";
import { Alert, Button, useToast } from "@/components/ui";

export function DismissibleAlertDemo() {
  const [shown, setShown] = useState(true);
  return shown ? (
    <Alert tone="error" title="Payment failed" onDismiss={() => setShown(false)}>
      No money left your account. Check your card details and try again.
    </Alert>
  ) : (
    <Button variant="quiet" onClick={() => setShown(true)}>
      Show the alert again
    </Button>
  );
}

export function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast.show({ tone: "success", title: "Contribution received", message: "NGN 5,000 added to your balance." })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => toast.show({ tone: "pending", title: "Checking your payment", message: "This can take a minute. Your money is safe." })}>
        Pending toast
      </Button>
      <Button variant="secondary" onClick={() => toast.show({ tone: "error", title: "Payment failed", message: "No money left your account. Try again." })}>
        Error toast (stays)
      </Button>
      <Button variant="secondary" onClick={() => toast.show({ tone: "info", title: "Contact removed", durationMs: 8000, action: { label: "Undo", onClick: () => {} } })}>
        Toast with action
      </Button>
      <Button
        variant="quiet"
        onClick={() => {
          for (let i = 1; i <= 5; i++) toast.show({ title: `Toast ${i} of 5`, durationMs: 4000 });
        }}
      >
        Stack of five
      </Button>
    </div>
  );
}
