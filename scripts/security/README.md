# Proof script for the auth layer (AI-2, milestone 3b)

`prove-auth.mjs` checks, against the real God's Grace Supabase project, the claims in
`docs/security/07-identity-adapter-spec.md` that only the real Auth service can settle. The unit tests prove the
adapter does the right thing with the answers it expects. This script proves those are the answers Supabase gives.

## Run it

Needs Node 20 or newer and the packages already in the repo. From the repo root, with the keys in `.env.local`:

```bash
node --env-file=.env.local scripts/security/prove-auth.mjs --dry-run   # checks config, no network, creates nothing
node --env-file=.env.local scripts/security/prove-auth.mjs             # the real run, about two minutes
```

Environment (all four required):

| Name | What |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. The script refuses to run unless it is the God's Grace project (`cbxvgkbervkatpejgdag`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` also works). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. Used to create and delete throwaway users and to call the session functions. |
| `PROOF_EMAIL_BASE` | An inbox you control, like `you@yourdomain.com`. Throwaway users are `you+gg-proof-<run>-<tag>@yourdomain.com`. |

Options: `--only=P1,P8` runs some groups, `--skip-signup-emails` skips P7 (it sends two real emails, and the free
Supabase mail service allows very few per hour).

## What it does and does not do

- Creates throwaway users, all tagged `gg-proof-<run>`, and deletes them at the end, also if you press Ctrl+C. It only
  deletes users it created in this run. Real members are never touched.
- Never prints tokens, passwords, authenticator secrets or Supabase error messages. A failed check shows a status and a
  short error code, so the output is safe to paste back.
- Waits up to about 30 seconds between authenticator codes (P8, P9), because a code can only be used once per window.
- Do not run it while the first real members are signing up unless you want your own account activity in the same
  project. It is safe for them, but P7 and the rate limits share the project.

## Results

`PASS` the claim holds. `FAIL` a claim is wrong or Supabase answered in an unexpected way: send that line to AI-2, the
adapter or spec needs a change. `TODO` a project setting still needs changing (the line says which). `INFO` a fact to
read, or a manual step.

| Group | Proves |
|-------|--------|
| P1 | A signed out session's token still looks valid locally but the live check refuses it, and its refresh token is dead. |
| P2 | `revoke_all_sessions` ends every session of a user, access and refresh. |
| P3 | `revoke_session` only ends a session for its owner. |
| P4 | Sign out scopes, and that a bare `signOut()` ends the other devices too. |
| P5 | The throwaway session used to check a password can be closed without touching the real one. |
| P6 | An unverified email is only revealed after the right password, and unknown addresses look like wrong passwords. |
| P7 | Sign up for an existing address (empty identities list, no error, no session). Also needs a manual look at your inbox. |
| P8 | MFA: unverified factors are not counted, a wrong code gives `mfa_verification_failed`, the right one makes aal2. |
| P9 | Two authenticators: the first can be removed and the second still gets in (the super admin recovery plan). |
| P10 | A reset link signs in, sets the password, works once, a made up link is refused, and ending all sessions kills it. |
| P11 | The 72 byte limit and byte counting, the project minimum of 10, leaked password protection (information only). |
| P12 | Access token lifetime is 900 seconds. |
| P13 | Each sign in gets a new session id. |

## How it was tested before you run it

The helpers (authenticator codes, token reading, address building) have unit tests, including the RFC 6238 vectors.
The whole script was run against an in-memory stand in for the Auth service, which found no script errors, and the
stand in was then broken in eleven ways to confirm each one shows up as `FAIL` or `TODO`. That only proves the script
logic. Whether Supabase really answers the way the stand in does is exactly what your run settles.
