import { describe, expect, it } from "vitest";
import { PAYMENT_ATTEMPT_STATUSES } from "../../contracts/enums";
import { PAYMENT_STATUS_PRESENTATION, failureCopy, isInFlight } from "./payment-status";

describe("payment status presentation", () => {
  it("has copy for every server status", () => {
    for (const status of PAYMENT_ATTEMPT_STATUSES) {
      const entry = PAYMENT_STATUS_PRESENTATION[status];
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.explanation.length).toBeGreaterThan(0);
    }
  });

  it("only successful is shown as success", () => {
    const successTones = PAYMENT_ATTEMPT_STATUSES.filter((s) => PAYMENT_STATUS_PRESENTATION[s].tone === "success");
    expect(successTones).toEqual(["successful"]);
  });

  it("every in progress status tells the member not to pay again", () => {
    const inFlight = PAYMENT_ATTEMPT_STATUSES.filter((s) => isInFlight(s));
    expect(inFlight).toEqual(["initiating", "awaiting_authentication", "processing", "verifying"]);
    for (const status of inFlight) {
      expect(PAYMENT_STATUS_PRESENTATION[status].explanation).toContain("Do not pay again");
      expect(PAYMENT_STATUS_PRESENTATION[status].isFinal).toBe(false);
    }
  });

  it("in progress and final are never both true or both false", () => {
    for (const status of PAYMENT_ATTEMPT_STATUSES) {
      const entry = PAYMENT_STATUS_PRESENTATION[status];
      expect(entry.inFlight).toBe(!entry.isFinal);
    }
  });

  it("claims no charge only for states where money did not move", () => {
    for (const status of ["failed", "cancelled", "expired"] as const) {
      expect(PAYMENT_STATUS_PRESENTATION[status].explanation).toContain("not charged");
    }
    for (const status of ["successful", "reversed", "processing", "verifying"] as const) {
      expect(PAYMENT_STATUS_PRESENTATION[status].explanation).not.toContain("not charged");
    }
  });
});

describe("failureCopy", () => {
  it("returns the contract copy for a payment code", () => {
    const copy = failureCopy("PAYMENT_DECLINED");
    expect(copy?.message).toContain("declined");
    expect(copy?.action.length).toBeGreaterThan(0);
  });

  it.each([["WEBHOOK_SIGNATURE_INVALID"], ["INTERNAL"], ["PROVIDER_VERIFY_MISMATCH"], ["toString"], ["PAYMENT_MADE_UP"], [""]])(
    "never shows %s",
    (code) => {
      expect(failureCopy(code)).toBeNull();
    },
  );

  it("returns null for a missing code", () => {
    expect(failureCopy(null)).toBeNull();
  });
});
