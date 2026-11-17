import { z } from "zod";
import { MEMBER_STATUSES } from "../../contracts/enums";
import { uuidSchema } from "../../contracts/schemas";

export const MEMBER_SEARCH_MAX = 100;
export const STATUS_REASON_MIN = 3;
export const STATUS_REASON_MAX = 500;

/**
 * Staff type these values and they end up in audit rows and search queries. Rejects every control character
 * (line breaks and tabs included), C1 controls and bidirectional override or isolate characters.
 */
function hasUnsafeCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127 || (code >= 0x80 && code <= 0x9f)) {
      return true;
    }
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return true;
    }
  }
  return false;
}

/** An empty search means no search. The repository must treat the text as literal, see the handoff request M-4. */
const searchSchema = z
  .string()
  .trim()
  .max(MEMBER_SEARCH_MAX, `Use at most ${MEMBER_SEARCH_MAX} characters.`)
  .refine((value) => !hasUnsafeCharacters(value), "Use plain text only.");

export const listMembersInputSchema = z.object({
  status: z.enum(MEMBER_STATUSES).optional(),
  search: searchSchema.optional(),
});

export const getMemberInputSchema = z.object({
  memberId: uuidSchema,
});

export const setMemberStatusInputSchema = z.object({
  memberId: uuidSchema,
  status: z.enum(MEMBER_STATUSES),
  reason: z
    .string()
    .trim()
    .min(STATUS_REASON_MIN, "Give a short reason.")
    .max(STATUS_REASON_MAX, `Use at most ${STATUS_REASON_MAX} characters.`)
    .refine((value) => !hasUnsafeCharacters(value), "Use plain text on one line."),
});
