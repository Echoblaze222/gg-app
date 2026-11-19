"use client";

import { Button } from "@/components/ui";

/** Opens the browser print dialog. The shell is hidden by print styles, so the receipt prints on its own. */
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
