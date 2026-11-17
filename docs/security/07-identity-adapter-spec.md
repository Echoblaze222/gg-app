# AI-2 spec: Supabase IdentityProvider adapter and session resolver (milestone 3)

Contracts: `IdentityProvider` (`lib/auth/types.ts`) and `SessionResolver` / `SessionFacts` (`lib/security/types.ts`) stay as they are, with the two additions under problem 5. The adapter only translates. All rules stay in `AuthService`.
Target project: the God's Grace Supabase project (see `06-applied-changes.md`). Claims below marked **PROVE** are expectations about Supabase behaviour that the proof script (milestone 3b) must confirm against the real project before they count as true.

## Design problems found before coding

1. **A revoked session keeps a valid access token until it expires.** Signing out, banning or revoking a device removes the refresh token, but the access token already issued still passes a signature check. `getClaims()` checks only the signature and expiry, so on its own it cannot see a revoked session. The resolver therefore does a live check with `getUser()` on every authenticated server request at launch (small user base, money moves through this app, latency is acceptable). Moving reads to `getClaims()` later is an optimisation that needs its own threat check. `getSession()` is never used for identity on the server, because it only decodes the cookie.
2. **No "sign out user by id" API.** `auth.admin.signOut` takes the user's access token and a scope, not a user id. `IdentityProvider.signOutEverywhere(userId)` is needed for password reset, suspension and admin force logout, where we hold no token. Plan: a `SECURITY DEFINER` SQL function `private.revoke_all_sessions(user_id uuid)` that deletes that user's rows in `auth.sessions`, executable by `service_role` only. **PROVE** that refresh tokens go with the session rows. Migration goes in the 2000 to 2999 range (AI-2 owns it).
3. **Default sign out scope is global.** A bare `signOut()` ends every device. The adapter must always pass the scope: `signOut()` is `local`, `signOutOthers()` is `others`. A test pins this, because the default is the dangerous one.
4. **`verifyPassword` has no matching Supabase call.** Plan: sign in with a throwaway stateless client (no cookie storage, no refresh), then end that session with scope `local` straight away. The real session is never touched. Cost: each check writes a short lived row to the auth log and counts toward Supabase's own sign-in limits. The service already rate limits reauth per member. Email is looked up by user id through the admin client. **PROVE** the throwaway session leaves nothing behind.
5. **Reauth state has a write side but no read side.** `ReauthStore` only has `mark`, and `SessionFacts.recentlyReauthenticated` needs a read. Add `isRecent(sessionId, memberId): Promise<boolean>` to the `lib/auth` interface (not a frozen contract). Keyed by session id, so a new login never inherits an old confirmation. Stored in a small table (session id, member id, confirmed at) with RLS denying everything and access by `service_role` only. A signed cookie was rejected because it cannot be cancelled server side.
6. **Cookies can only be written in route handlers and server actions.** `verifyTotp` moves the session from aal1 to aal2 and returns new tokens that must be written back. It may only be called where cookies are writable. Server Components call the resolver, which never refreshes or writes cookies.
7. **Reset links create a session.** The recovery token exchange signs the person in. `resetPasswordWithToken` must use a stateless client, set the password, and the service then calls `signOutEverywhere(userId)`, which also ends the session the link just created.
8. **Our password limits must fit inside the provider's.** `password.ts` accepts 10 to 128 characters. Supabase hashes with bcrypt, which only uses the first 72 bytes, and as far as I know the provider rejects longer passwords (**PROVE**). A 100 character password would pass our check and then fail at the provider with text the user should never see. Decision: the project minimum is set to 10 to match ours, and the maximum in `password.ts` drops to 72 **bytes** (byte length, not characters, so non-ASCII passwords are counted correctly). That is a small change to `lib/auth/password.ts` and its test, made in this milestone.

## Threat check

| Threat | Control |
|--------|---------|
| Tampered or forged cookie | Identity comes only from a live `getUser()`. The member id is the verified user id, nothing from the cookie body. |
| Stolen access token after logout or revoke | Live check ends it at once. Access token lifetime set to 900 seconds as a second layer (project setting, see Decisions). |
| Role escalation through user editable metadata | `user_metadata` is writable by the user. It is never read for roles, status or money. Roles come from the role repository only. |
| Service role key exposure | One admin client in a server only module, separate env var, never imported by client code. A test fails the build if the module is reachable from a client entry. |
| Account enumeration | Existing email on signup, wrong password versus unknown email, and reset all map to the same results. Adapter maps by error **code**, never by message text. |
| Provider text leaking to the user | Adapter returns typed outcomes or throws. It never returns provider messages. Unknown error codes throw, which the service turns into `SYSTEM_UNAVAILABLE`. Unknown never becomes `invalid_credentials`. |
| MFA bypass or downgrade | `mfaVerified` is true only when the verified token carries aal2. `mfaEnrolled` counts verified factors only, so an abandoned enrolment does not lock anyone in or out. |
| Session fixation | A new session is issued on every sign in by the provider. **PROVE** an old cookie is not reused. |
| Revoked device still accepted | Resolver also asks the device store. A device marked revoked is rejected even if the provider session lives. Revoking a device must also delete that session (request to AI-1, who owns `DeviceStore`). |
| Throwaway sessions pile up | Problem 4. Each is closed in a `finally`. |

## Behaviour per method

| Method | Rule |
|--------|------|
| signUp | Calls the provider sign up with confirmation required. Existing address returns `alreadyRegistered: true` with no error. **PROVE** how the provider signals this (expected: success with an empty identities list) and that the real owner gets the email. Never passes `is_admin`, role or status in metadata. |
| signInWithPassword | Invalid credentials maps to `invalid_credentials`. Unverified email only reported after a correct password (**PROVE** the provider does not reveal it earlier). Success reads the assurance level for `mfaEnrolled`. |
| verifyPassword | Problem 4. Returns false on wrong password, throws on infrastructure failure. |
| verifyTotp | Six digit code, first verified TOTP factor, challenge and verify. No verified factor returns false. |
| signOut, signOutOthers | Scope `local` and `others`. Never global. |
| requestPasswordReset | Same result for known and unknown email. Provider failure throws, the service swallows and logs it. |
| resetPasswordWithToken | Problem 7. Invalid, expired or used token returns `invalid_token`. Failure after the token was consumed throws, it is not reported as an invalid token. |
| updatePassword | Admin update by user id. |
| signOutEverywhere | Problem 2. |
| SessionResolver.resolve | Live check, then member id, session id, `mfaVerified` from aal2, `recentlyReauthenticated` from `isRecent`, device not revoked. Reads the token from the cookie session, asks the Auth server about exactly that token, and takes `aal` and `session_id` from that same token. A token whose subject differs from the verified user, or that has no session id, gives `null`. Returns `null` for no or invalid session, throws on provider outage or store failure. |

## Test plan (written before the adapter)

The adapter takes a narrow `SupabaseLike` interface so tests use a fake, as the service tests do. Abuse cases:

B1 error mapping by code, message text never returned; B2 unknown code throws, never `invalid_credentials`; B3 existing email signup returns `alreadyRegistered`; B4 unverified email only after correct password; B5 `signOut` passes scope local, `signOutOthers` passes others, nothing passes global; B6 `verifyPassword` closes its throwaway session even when the check fails or throws; B7 `verifyPassword` never touches the caller's cookies; B8 TOTP with no verified factor returns false; B9 `mfaEnrolled` ignores unverified factors; B10 token exchange for reset uses a stateless client and an invalid token gives `invalid_token`; B11 failure after token consumption throws; B12 resolver returns null on missing cookie, tampered token and revoked session; B13 resolver ignores `user_metadata` and `app_metadata` for identity; B14 `mfaVerified` only from aal2; B15 reauth from another session does not carry over; B16 revoked device rejected; B17 store failure throws; B18 admin client module is not importable from client code.

Then a mutation run in the same style as milestone 2: break each control on purpose, every break must be caught.

## Proof script (milestone 3b, runs on Pius's machine)

Uses throwaway users with plus addresses and deletes them at the end. It proves: session revoke ends access at once (problem 1), revoke by user id (problem 2), existing email signup behaviour, unverified email ordering, TOTP enrol and verify moving aal1 to aal2, MFA recovery with two enrolled authenticators, reset link session handling, and throwaway session cleanup (problem 4). It prints pass or fail per claim and never prints tokens.

## Decisions

- **Session check:** live `getUser()` on every authenticated server request at launch.
- **Access token lifetime:** 900 seconds. Short enough to limit a stolen token, long enough that refresh traffic stays low. Dashboard setting, applied by Pius and recorded in `06-applied-changes.md` once done.
- **Project password minimum:** 10, matching `password.ts`. Maximum in code becomes 72 bytes (problem 8).
- **Leaked password protection:** turn it on if the project plan allows it. If not, it stays a documented known limit, as in the AuthService spec.
- **Reauth store:** new table keyed by session id (problem 5), migration in the 2000 to 2999 range.
- **Session revoke by user id:** `private.revoke_all_sessions` (problem 2), same migration range.

## Still needs someone else

- AI-1: `DeviceStore.revoke` must end the provider session, not only flag the row.
- The super admin's client: confirm two enrolled authenticators as the MFA recovery plan. The proof script cannot be final until then.

Not in this milestone: secure headers, CSRF, CORS, `proxy.ts`, Google sign in.
