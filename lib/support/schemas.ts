import { z } from "zod";
import { supportTicketInputSchema, uuidSchema } from "../../contracts/schemas";

/** NUL characters cannot be stored in text columns and would turn a form mistake into a server error. */
const noNul = (value: string) => !value.includes("\u0000");
const NO_NUL_MESSAGE = "This text contains a character that is not allowed.";

export const ticketInputSchema = z.object({
  subject: supportTicketInputSchema.shape.subject.refine(noNul, NO_NUL_MESSAGE),
  body: supportTicketInputSchema.shape.body.refine(noNul, NO_NUL_MESSAGE),
});

export const replyInputSchema = z.object({
  ticketId: uuidSchema,
  body: z.string().trim().min(1).max(4000).refine(noNul, NO_NUL_MESSAGE),
});
