import { z } from "zod";
import { PRIVACY_REQUEST_KINDS } from "../../contracts/enums";
import { uuidSchema } from "../../contracts/schemas";

export const policyAcceptInputSchema = z.object({ policyVersionId: uuidSchema });

export const privacyCreateInputSchema = z.object({ kind: z.enum(PRIVACY_REQUEST_KINDS) });
