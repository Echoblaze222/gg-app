import type { z } from "zod";
import { AppError, type Result } from "@/contracts/errors";

export interface ParseBodyOptions {
  /** Hard ceiling in bytes, enforced while reading the stream. */
  maxBytes: number;
  /** Correlation id used as the error reference. */
  requestId: string;
}

function fail<T>(code: "VALIDATION_FAILED" | "PAYLOAD_TOO_LARGE", requestId: string, fields?: Record<string, string>): Result<T> {
  return { ok: false, error: new AppError(code, { reference: requestId, fields }).toShape() };
}

/**
 * Reads and validates a JSON request body. Enforces the byte cap while streaming (a missing or false
 * Content-Length does not help an attacker), requires a JSON content type, and returns field names only.
 */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S, options: ParseBodyOptions): Promise<Result<z.infer<S>>> {
  const { maxBytes, requestId } = options;

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return fail("PAYLOAD_TOO_LARGE", requestId);

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return fail("VALIDATION_FAILED", requestId);

  if (!request.body) return fail("VALIDATION_FAILED", requestId);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return fail("PAYLOAD_TOO_LARGE", requestId);
    }
    chunks.push(value);
  }
  if (total === 0) return fail("VALIDATION_FAILED", requestId);

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("VALIDATION_FAILED", requestId);
  }

  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fail("VALIDATION_FAILED", requestId, fields);
}
