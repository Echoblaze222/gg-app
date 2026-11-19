# Contract request: env name for the rate limit identifier secret (AI-2 to Integrator, AI-1)

Why: the rate limiter must not store raw emails or IP addresses as counter keys. Keys are HMACs. `OTP_PEPPER` exists but must not be reused for a second purpose (a leak of one purpose would weaken the other).

Needed in `contracts/env.md`, `.env.example` and `lib/env.ts`: `RATE_LIMIT_HMAC_SECRET` (server only, required, at least 32 random bytes).
