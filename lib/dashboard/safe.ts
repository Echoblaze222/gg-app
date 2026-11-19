import { AppError } from "@/contracts/errors";
import type { Result } from "@/contracts/errors";

/** Runs a service call and turns an unexpected throw into an INTERNAL error that carries the request reference. Expected failures already arrive as Result errors. */
export async function safe<T>(requestId: string, call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, error: new AppError("INTERNAL", { reference: requestId }).toShape() };
  }
}
