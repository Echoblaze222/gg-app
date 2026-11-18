import { AppError, type AppErrorShape, type ErrorCode, type Result } from "@/contracts/errors";

export type Failure = { readonly ok: false; readonly error: AppErrorShape };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(code: ErrorCode, requestId: string, fields?: Record<string, string>): Failure {
  return { ok: false, error: new AppError(code, { reference: requestId, ...(fields ? { fields } : {}) }).toShape() };
}

/**
 * Turns anything thrown by a repository or dependency into a safe failure.
 * Contract errors keep their own code (for example IDEMPOTENCY_KEY_REUSED or LEDGER_NEGATIVE_BALANCE).
 * Everything else becomes INTERNAL with the request id as the reference. No message or stack is passed on.
 */
export function failFromThrown(err: unknown, requestId: string): Failure {
  if (err instanceof AppError) return { ok: false, error: err.toShape() };
  return fail("INTERNAL", requestId);
}

/** Name of what was thrown, for logs. Never the message, which could carry provider text. */
export function thrownKind(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
