"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { PaymentStages, type MoneyMoved, type PaymentStageState } from "@/components/motion/PaymentStages";
import { ReceiptPrinter, type ReceiptPrinterState } from "@/components/motion/ReceiptPrinter";

export function ReceiptPrinterDemo() {
  const [state, setState] = useState<ReceiptPrinterState>("printing");
  const [verified, setVerified] = useState(true);
  const [run, setRun] = useState(0);
  const play = (next: ReceiptPrinterState) => {
    setState(next);
    setRun((n) => n + 1);
  };
  return (
    <div className="grid justify-items-center gap-6">
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={() => play("printing")}>Print</Button>
        <Button variant="secondary" onClick={() => play("printed")}>Finished</Button>
        <Button variant="secondary" onClick={() => play("failed")}>Paper jam</Button>
        <Button variant="secondary" onClick={() => play("idle")}>Idle</Button>
        <Button variant="quiet" aria-pressed={verified} onClick={() => setVerified((v) => !v)}>
          {verified ? "Server verified: yes" : "Server verified: no"}
        </Button>
      </div>
      <ReceiptPrinter
        key={`${run}-${verified}`}
        state={state}
        verified={verified}
        amount="NGN 5,000.00"
        reference="GGC-2026-000123"
        lines={[
          { label: "Plan", value: "Monthly" },
          { label: "Paid on", value: "17 Nov 2026" },
          { label: "Method", value: "Card ending 4417" },
        ]}
        onRetry={() => play("printing")}
        onReplay={() => play("printing")}
      >
        <Button variant="primary">Download</Button>
        <Button variant="secondary">Share</Button>
      </ReceiptPrinter>
    </div>
  );
}

const STAGE_BUTTONS: [PaymentStageState, string][] = [
  ["initiating", "Initiating"],
  ["awaiting_auth", "Bank approval"],
  ["processing", "Processing"],
  ["verifying", "Verifying"],
  ["successful", "Successful"],
  ["pending_long", "Taking long"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
  ["expired", "Expired"],
];

export function PaymentStagesDemo() {
  const [state, setState] = useState<PaymentStageState>("initiating");
  const [money, setMoney] = useState<MoneyMoved>("no");
  const [run, setRun] = useState(0);
  const play = (next: PaymentStageState) => {
    setState(next);
    setRun((n) => n + 1);
  };
  return (
    <div className="grid justify-items-center gap-6">
      <div className="flex flex-wrap justify-center gap-2">
        {STAGE_BUTTONS.map(([value, label]) => (
          <Button key={value} variant={state === value ? "primary" : "secondary"} aria-pressed={state === value} onClick={() => play(value)}>
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Did money move? (used by the Failed state)">
        {(["no", "unknown", "yes"] as const).map((value) => (
          <Button key={value} variant={money === value ? "primary" : "quiet"} aria-pressed={money === value} onClick={() => { setMoney(value); if (state === "failed") setRun((n) => n + 1); }}>
            Money moved: {value}
          </Button>
        ))}
      </div>
      <PaymentStages
        key={run}
        state={state}
        elapsedLabel="Waiting for 2 minutes"
        failure={{
          message:
            money === "no" ? "The payment was declined. You were not charged." : money === "unknown" ? "We are waiting for confirmation from the payment provider." : "This payment was reversed.",
          action: money === "no" ? "Try another card or payment method." : money === "unknown" ? "Check your payment history. We will update it when confirmed." : "Contact support if you need help.",
          moneyMoved: money,
        }}
      />
    </div>
  );
}
