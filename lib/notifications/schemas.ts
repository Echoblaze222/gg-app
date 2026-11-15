import { z } from "zod";
import { NOTIFICATION_TYPES } from "../../contracts/enums";
import { uuidSchema } from "../../contracts/schemas";

/** NUL characters cannot be stored in text columns and would turn a bad value into a server error. */
const noNul = (value: string) => !value.includes("\u0000");
const NO_NUL_MESSAGE = "This text contains a character that is not allowed.";

/**
 * Deep links stay inside the member app. No scheme, no host, no protocol relative links and no dot segments,
 * so a notification can never send a member to another site or to an admin page.
 */
export const deepLinkSchema = z
  .string()
  .max(200)
  .regex(/^\/app(\/[A-Za-z0-9._~%-]+)*$/, "Links must stay inside the member app.")
  .refine((value) => !value.split("/").some((segment) => segment === "." || segment === ".."), "Links must stay inside the member app.");

export const notifyInputSchema = z.object({
  memberId: uuidSchema,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1).max(120).refine(noNul, NO_NUL_MESSAGE),
  body: z.string().trim().min(1).max(1000).refine(noNul, NO_NUL_MESSAGE),
  link: deepLinkSchema.optional(),
});

export const MAX_MARK_READ_IDS = 100;

export const markReadInputSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(MAX_MARK_READ_IDS),
});

/** Field level messages for forms and API errors, keyed by field path. */
export function fieldsFromZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
