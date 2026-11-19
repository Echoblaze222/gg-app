import { z } from "zod";
import { policyKindSchema, uuidSchema } from "../../contracts/schemas";

/** NUL characters cannot be stored in text columns and would turn a form mistake into a server error. */
const noNul = (value: string) => !value.includes("\u0000");
const NO_NUL_MESSAGE = "This text contains a character that is not allowed.";

export const policyAcceptInputSchema = z.object({ policyVersionId: uuidSchema });

export const policyPublishInputSchema = z.object({
  kind: policyKindSchema,
  version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/, "Use letters, numbers, dots, dashes and underscores, up to 32 characters."),
  body: z.string().trim().min(20).max(200_000).refine(noNul, NO_NUL_MESSAGE),
  draft: z.boolean(),
});

export const privacyDecideInputSchema = z.object({
  requestId: uuidSchema,
  approve: z.boolean(),
  note: z.string().trim().max(1000).refine(noNul, NO_NUL_MESSAGE).optional(),
});
