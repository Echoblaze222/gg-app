# Environment variables (names only, never values)

Validated at boot by `lib/env.ts` (AI-1). The app refuses to start with a clear message when a required value is missing. Live values live only in the host secret store. `.env.example` lists the same names with empty values.

| Name | Scope | Required | Purpose |
|------|-------|----------|---------|
| `APP_ENV` | server | yes | `development`, `test`, `staging` or `production` |
| `NEXT_PUBLIC_APP_URL` | public | yes | Absolute site URL for links and redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | public | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes | Supabase anon key. Safe for the browser, protected by row level security |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | yes | Service role. Never imported from client code. Server modules import `server-only` |
| `DATABASE_URL` | server only | yes | Pooled Postgres connection string for server code |
| `TEST_DATABASE_URL` | test only | tests | Disposable Postgres for database and RLS tests |
| `PAYSTACK_SECRET_KEY` | server only | payments | Test key outside production, live key only in production secret store |
| `PAYSTACK_BASE_URL` | server only | no | Defaults to the official API base. Overridden in tests |
| `CRON_SECRET` | server only | jobs | Authenticates scheduled job endpoints |
| `LOG_LEVEL` | server | no | `debug`, `info`, `warn`, `error`. Default `info` |
| `OTP_PEPPER` | server only | yes | Secret mixed into hashed OTPs and tokens |
| `EMAIL_PROVIDER_API_KEY` | server only | pending | Provider not chosen yet. Owner decision |
| `SMS_PROVIDER_API_KEY` | server only | pending | Provider not chosen yet. Owner decision |

Rules: no secret in client code, no secret in logs, no `NEXT_PUBLIC_` prefix on anything private. Rotate anything ever exposed.
