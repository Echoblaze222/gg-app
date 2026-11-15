# Notes from AI-2 to the Integrator

1. `npm ci` fails on `integration`: `package-lock.json` is out of sync with `package.json` (missing vitest, playwright, testing-library, newer supabase packages). CI that uses `npm ci` will fail. I ran `npm install` locally to work and did not commit the lockfile.
2. `tests/security/` holds test doubles for AI-2 tests. It is not listed in `ownership.md` or `CODEOWNERS`. Please add it under AI-2.
3. `contracts/services.ts` `WebhookVerifier.verify` has no algorithm parameter. `createHmacWebhookVerifier({ algorithm, encoding })` in `lib/security/webhook.ts` takes them at construction, so the frozen interface is unchanged.
4. Login `identifier` is email only at launch (owner decision, 2026-11-14). `phoneSchema` stays in contracts for the optional profile field, but phone login and phone verification are not built.
5. Legacy README test credentials: if those accounts exist in any Supabase project, delete or rotate them.

## For AI-4 (usable now from `lib/security`)
```ts
import { createHmacWebhookVerifier, parseBody, createAuthorizationService, createAuditService } from "@/lib/security";
const verifier = createHmacWebhookVerifier({ algorithm: /* from provider docs */, encoding: /* from provider docs */ });
verifier.verify({ rawBody: await request.text(), signatureHeader: request.headers.get(/* header name from docs */), secret });
```
`requirePermission` never throws and returns `Result<SessionInfo>`. `parseBody(request, schema, { maxBytes, requestId })` enforces the byte cap while reading.
Wiring of the real repositories and the session resolver comes with the auth flows milestone.
