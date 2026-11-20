import { describe, expect, it } from "vitest";
import { AppError } from "@/contracts/errors";
import type { Result } from "@/contracts/errors";
import type { LedgerEntry, Page, PaymentAttempt } from "@/contracts/entities";
import type { RequestContext } from "@/contracts/services";
import { loadHistoryPage } from "./history-loader";

const ctx: RequestContext = { requestId: "req-5", actorId: null, ip: null, userAgent: null };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const attempt = (o: Partial<PaymentAttempt> = {}): PaymentAttempt => ({ id: "at1", memberId: "m", purpose: "one_time_contribution", channel: "card", amountKobo: 250000, currency: "NGN", status: "successful", reference: "ref-1", idempotencyKey: "k", obligationId: null, paymentMethodId: null, providerTransactionId: null, failureCode: null, createdAt: "2026-11-10T10:00:00Z", updatedAt: "2026-11-10T10:00:00Z", completedAt: "2026-11-10T10:00:00Z", ...o });
const credit = { id: "l1", entryType: "contribution_credit", direction: "credit", amountKobo: 250000, receiptNumber: "GG-0001", paymentAttemptId: "at1" } as unknown as LedgerEntry;
const page = <T,>(items: T[], nextCursor: string | null = null): Page<T> => ({ items, nextCursor });

const svc = (attempts: Result<Page<PaymentAttempt>>, ledger: Result<Page<LedgerEntry>> = ok(page([credit]))) =>
  ({ payments: { listHistory: async () => attempts }, contributions: { listLedger: async () => ledger } }) as unknown as Parameters<typeof loadHistoryPage>[0];

describe("loadHistoryPage", () => {
  it("maps attempts and links a receipt only when the ledger has one", async () => {
    const r = await loadHistoryPage(svc(ok(page([attempt(), attempt({ id: "at2", reference: "ref-2" })], "next-1"))), ctx, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nextCursor).toBe("next-1");
      expect(r.value.rows[0].href).toBe("/app/history/GG-0001");
      expect(r.value.rows[1].href).toBeNull();
    }
  });
  it("still shows history, without receipt links, when the ledger lookup fails", async () => {
    const r = await loadHistoryPage(svc(ok(page([attempt()])), { ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "x" }).toShape() }), ctx, null);
    expect(r.ok && r.value.rows[0].href).toBeNull();
  });
  it("counts a corrupt row instead of hiding it or showing a wrong amount", async () => {
    const r = await loadHistoryPage(svc(ok(page([attempt({ amountKobo: -1 }), attempt({ id: "at3" })]))), ctx, null);
    expect(r.ok && r.value.skipped).toBe(1);
    expect(r.ok && r.value.rows).toHaveLength(1);
  });
  it("passes an attempts failure through, and turns a throw into INTERNAL with the reference", async () => {
    const failed = await loadHistoryPage(svc({ ok: false, error: new AppError("SYSTEM_UNAVAILABLE", { reference: "r" }).toShape() }), ctx, null);
    expect(!failed.ok && failed.error.code).toBe("SYSTEM_UNAVAILABLE");
    const thrown = await loadHistoryPage({ payments: { listHistory: async () => { throw new Error("db"); } }, contributions: { listLedger: async () => ok(page([])) } } as never, ctx, null);
    expect(!thrown.ok && thrown.error.reference).toBe("req-5");
  });
});
