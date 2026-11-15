import { z } from "zod";
import { uuidSchema } from "../../contracts/schemas";

export const policyAcceptInputSchema = z.object({ policyVersionId: uuidSchema });
