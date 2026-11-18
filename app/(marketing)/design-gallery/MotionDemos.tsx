"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
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
