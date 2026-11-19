import { AppError, type ErrorCode, type Result } from "../../contracts/errors";

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Builds a safe failure. `reference` is the request correlation id so support can find the log line. */
export function fail(code: ErrorCode, reference: string, fields?: Record<string, string>): Result<never> {
  return { ok: false, error: new AppError(code, { reference, fields }).toShape() };
}

/**
 * Maps anything thrown to a safe failure. Known AppErrors keep their code. Everything else becomes INTERNAL
 * and its message is never copied into the result, so internals and secrets cannot leak to a screen.
 */
export function failFrom(error: unknown, reference: string): Result<never> {
  if (error instanceof AppError) {
    return { ok: false, error: error.toShape() };
  }
  return fail("INTERNAL", reference);
}
