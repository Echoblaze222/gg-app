# Integrator: auth wiring, part 2

From: Integrator. To: AI-2, AI-3, owner. Date: 2026-11-18. Follows `integrator-auth-wiring.md`.

## Added
- `/auth/confirm` (route): target of the sign up confirmation email. Confirms the address, ends the session the link opened, redirects to `/login?verified=1|failed`.
- `/mfa/setup`: authenticator app enrolment (start, scan, first code). Actions in `app/(auth)/mfa/setup/actions.ts`, audited as `auth.mfa_enrolled`.
- Google sign in: `getGoogleAuthUrl` in the gateway starts it, `/auth/callback` finishes it. The callback refuses any member who is not `active`, registers the device, audits `auth.login_google`, then sends the member to `/accept-terms`, `/mfa` or `/app`.
- `/accept-terms`: a new Google account skips the sign up checkbox, so this step records acceptance of the current terms and privacy policy (chosen by the server) before the account is used.
- Login page shows the confirmation and Google messages.

## Known limits
- Nothing outside `/accept-terms` yet blocks a Google member who has not accepted the terms. The callback sends them there, but a member who types another address in the browser is not stopped until the session gate in `proxy.ts` checks acceptance. Owner decision needed on where that check lives.
- Google stays off until the provider is enabled in Supabase. Until then the Google button shows "temporarily unavailable".
- `NEXT_PUBLIC_SITE_URL` is optional. If it is not set, the request host is used.
- None of this was run locally. The pull request's CI is the first typecheck, lint and test run.
