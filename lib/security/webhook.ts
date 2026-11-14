import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookVerifier } from "@/contracts/services";

export interface HmacWebhookOptions {
  /** Take both values from the provider's current official documentation. There is no default on purpose. */
  algorithm: "sha256" | "sha512";
  encoding: "hex" | "base64";
}

const HEX = /^[0-9a-fA-F]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decode(value: string, encoding: "hex" | "base64"): Buffer | null {
  if (encoding === "hex") {
    if (value.length % 2 !== 0 || !HEX.test(value)) return null;
    return Buffer.from(value, "hex");
  }
  if (value.length % 4 !== 0 || !BASE64.test(value)) return null;
  return Buffer.from(value, "base64");
}

/**
 * HMAC signature check over the raw request body. `rawBody` must be the exact text read from the request
 * before any JSON parsing. Compares in constant time. Returns false, never throws.
 */
export function createHmacWebhookVerifier(options: HmacWebhookOptions): WebhookVerifier {
  return {
    verify({ rawBody, signatureHeader, secret }) {
      try {
        if (!secret || !signatureHeader) return false;
        const header = signatureHeader.trim();
        if (!header) return false;
        const provided = decode(header, options.encoding);
        if (!provided) return false;
        const expected = createHmac(options.algorithm, secret).update(rawBody, "utf8").digest();
        if (provided.length !== expected.length) return false;
        return timingSafeEqual(provided, expected);
      } catch {
        return false;
      }
    },
  };
}
