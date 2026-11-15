# AI-2 spec: AuthService (milestone 2)

Contract: `AuthService` in `contracts/services.ts` (frozen). Email only login at launch (owner decision). Google sign-in is a later milestone and must use the same paths.
Not verified here: the real Supabase adapter. This milestone builds the service against an `IdentityProvider` interface and proves the rules with test doubles. Spikes S1 to S3 still need a Supabase project.

## Design problems found before coding

1. **Shared addresses.** Many mobile users sit behind one carrier address (carrier grade NAT). A single per address limit tight enough to stop password guessing would lock out real users. So a rule has two limits: `limit` per address (loose) and `accountLimit` per account (tight). This extends my own rate limiter only. The frozen `RateLimitRule` type is unchanged because callers pass a structurally compatible object.
2. **Lockout as an oracle.** If only real accounts could become locked, an attacker could learn which emails exist. The account counter is keyed on a hash of the typed email (turned into a UUID shaped value), whether or not the account exists. Existing and unknown emails behave the same.

## Behaviour per method

| Method | Rule |
|--------|------|
| register | Rate limited. Email normalised, name and Nigerian phone validated (phone stored only as an unverified profile field). Weak password check (length, common passwords, contains email or name). Latest `terms` and `privacy` policy versions must be accepted, and if none is published registration is refused (fail closed). Already registered email returns the same success shape with a random id, so existence is not revealed. Profile row creation is a database trigger (AI-1), the service never writes `is_admin`, balances or roles. |
| login | Rate limited by address and by typed email. Blocked gives `AUTH_ACCOUNT_LOCKED`. Wrong password and unknown email give the same `AUTH_INVALID_CREDENTIALS`. Unverified email only after a correct password. Suspended or closed: new session is ended and `AUTH_ACCOUNT_SUSPENDED` returned. Privileged roles always get `mfaRequired`. Provider outage gives `SYSTEM_UNAVAILABLE`, never provider text. |
| verifyMfa | Needs a session. Six digit code only. Rate limited per account. Failures write `mfa_failed`. |
| logout | Always ends the current session. |
| getSession | From the verified session resolver. |
| requestPasswordReset | Always returns success, whether the email exists, the provider fails or not. Rate limited. |
| resetPassword | Strength check, invalid or used token gives `AUTH_RESET_LINK_INVALID`, success ends every session and writes `password_changed` and an audit row. |
| reauthenticate | Rate limited. Correct password marks the session as recently reauthenticated. |
| changePassword | Checks the new password first, reauthenticates with the current password, then requires `member.security.manage`, rejects a new password equal to the old one, updates, ends other sessions, writes `password_changed`. |
| listDevices, revokeDevice | Backed by a `DeviceStore` (contract request raised). Revoking a device that belongs to someone else returns `NOT_FOUND`. |

## Abuse cases (tests)

A1 enumeration on register, A2 weak passwords, A3 policy not accepted, A4 register flood, A5 same error for wrong password and unknown email, A6 lockout identical for real and unknown emails, A7 suspended account, A8 privileged role forces MFA, A9 unverified email, A10 provider outage, A11 MFA guessing, A12 reset enumeration and token misuse, A13 change password without the right current password, A14 reauth marking, A15 device ownership.

## Verification evidence

148 tests pass in total (51 new in this milestone). `tsc --noEmit` and `eslint` clean. Mutation check: 16 controls broken on purpose in the auth service (lockout mapping, suspended check, privileged MFA, sign out everywhere, reauth step, device ownership, duplicate register id, privacy acceptance, no published policy, MFA code format, reauth marking, same password check, register strength, sign out others, password length bound, missing profile sign out), all 16 caught. Two extra mutants on the rate limiter account limit were also caught. One mutation run was interrupted halfway and left a deliberate break in the working copy; the next full test run caught it, it was restored and re-verified.

## Known limits

- Password strength is a short local check, not a breached password lookup. Supabase has leaked password protection on paid plans, worth enabling (owner decision).
- Timing between existing and unknown emails is not perfectly equal. Responses and codes are.
- Policy acceptance is written after the account exists. If that write fails the failure is logged and audited and registration still succeeds. AI-5 should gate first login on acceptance (handoff).
- The profile row (`members`) must be created by an AI-1 database trigger from the new auth user, with status `pending_verification`, role `member`, and no privileged or money columns taken from user supplied metadata. Handoff to AI-1.
