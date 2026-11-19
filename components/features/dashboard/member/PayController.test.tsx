import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/contracts/errors";
import type { PaymentAttempt } from "@/contracts/entities";

const initiate = vi.fn();
const verify = vi.fn();
const getAttempt = vi.fn();
vi.mock("@/lib/dashboard/actions", () => ({ initiatePaymentAction: (...a: unknown[]) => initiate(...a), verifyPaymentAction: (...a: unknown[]) => verify(...a), getAttemptAction: (...a: unknown[]) => getAttempt(...a) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { PayController } from "./PayController";

const OB = "3f1c9a52-6b7e-4d0a-9c1e-2a8f5d7b9e10";
const intent = { purpose: "scheduled_contribution" as const, amountKobo: 500000, obligationId: OB };
const attempt = (status: PaymentAttempt["status"]): PaymentAttempt => ({ id: "at1", memberId: "m", purpose: "scheduled_contribution", channel: null, amountKobo: 500000, currency: "NGN", status, reference: "gg_ref_123456", idempotencyKey: "k", obligationId: OB, paymentMethodId: null, providerTransactionId: null, failureCode: null, createdAt: "", updatedAt: "", completedAt: null });

beforeEach(() => {
  initiate.mockReset();
  verify.mockReset();
  getAttempt.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("PayController", () => {
  it("sends one payment and the same key even if the button is tapped twice", async () => {
    let release: (v: unknown) => void = () => {};
    initiate.mockImplementation(() => new Promise((r) => (release = r)));
    render(<PayController intent={intent} amountLabel="N5,000.00" returnedReference={null} />);
    const button = screen.getByRole("button", { name: "Pay N5,000.00" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(initiate.mock.calls[0][0].idempotencyKey).toMatch(/^gg_/);
    await act(async () => release({ ok: false, error: new AppError("PAYMENT_DECLINED", { reference: "r1" }).toShape() }));
  });

  it("shows a declined payment as not charged and offers a new attempt", async () => {
    initiate.mockResolvedValue({ ok: false, error: new AppError("PAYMENT_DECLINED", { reference: "r1" }).toShape() });
    render(<PayController intent={intent} amountLabel="N5,000.00" returnedReference={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay N5,000.00" }));
    await waitFor(() => expect(screen.getByText("Payment not completed")).toBeInTheDocument());
    expect(screen.getByText(/You were not charged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again, pay/ })).toBeInTheDocument();
  });

  it("a lost reply is an unknown outcome, never a failure, and the retry reuses the same key", async () => {
    initiate.mockRejectedValueOnce(new Error("network"));
    render(<PayController intent={intent} amountLabel="N5,000.00" returnedReference={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay N5,000.00" }));
    await waitFor(() => expect(screen.getByText("No reply from us")).toBeInTheDocument());
    expect(screen.queryByText("Payment not completed")).toBeNull();
    const firstKey = initiate.mock.calls[0][0].idempotencyKey;
    initiate.mockResolvedValueOnce({ ok: true, value: { attempt: attempt("initiating"), authorizationUrl: null } });
    verify.mockResolvedValue({ ok: true, value: attempt("successful") });
    fireEvent.click(screen.getByRole("button", { name: /Try again, pay/ }));
    await waitFor(() => expect(initiate).toHaveBeenCalledTimes(2));
    expect(initiate.mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });

  it("returning from the provider verifies with the server and shows success only for a successful attempt", async () => {
    verify.mockResolvedValue({ ok: true, value: attempt("successful") });
    render(<PayController intent={null} amountLabel="" returnedReference="gg_ref_123456" />);
    await waitFor(() => expect(screen.getByText("Payment received")).toBeInTheDocument());
    expect(verify).toHaveBeenCalledWith({ reference: "gg_ref_123456" });
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  });

  it("when verification fails and a retry is safe, the member can only check again, never pay again", async () => {
    verify.mockResolvedValue({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "r2" }).toShape() });
    render(<PayController intent={null} amountLabel="" returnedReference="gg_ref_123456" />);
    await waitFor(() => expect(screen.getByText("We could not confirm this payment")).toBeInTheDocument());
    expect(screen.queryByText("Payment not completed")).toBeNull();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
  });

  it("when verification fails and a retry is not safe, there is no pay button and no retry, only a way back", async () => {
    verify.mockResolvedValue({ ok: false, error: new AppError("PAYMENT_PROVIDER_TIMEOUT", { reference: "r3" }).toShape() });
    render(<PayController intent={null} amountLabel="" returnedReference="gg_ref_123456" />);
    await waitFor(() => expect(screen.getByText("We could not confirm this payment")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to home" })).toBeInTheDocument();
  });

  it("offline: nothing is sent and the member is told no money moved", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<PayController intent={intent} amountLabel="N5,000.00" returnedReference={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay N5,000.00" }));
    await waitFor(() => expect(screen.getByText("You are offline")).toBeInTheDocument());
    expect(initiate).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
