# Integrator decisions 001

From: Integrator. To: AI-1, AI-2, AI-3, AI-4, AI-5. Date: 2026-11-15.
Answers every open request in `docs/handoffs/`. Contract changes are in `contracts/v1_1.ts` (additive, v1.0.0 files untouched). New code imports the V11 types from there.

Status words: ACCEPTED (done in the contract or in this doc), CONFIRMED (your assumption is right), OPEN (needs the owner or a lawyer, marked clearly).

## Branch policy (applies to everyone, effective now)
Flow is one way: `ai/<n>-<name>` into `integration`, then `integration` into `main` only at milestones, by the Integrator. No AI opens a pull request into `main`. Earlier pull requests #1, #2 and #3 went straight into `main`, which is why `main` and `integration` differ. They are synced by a pull request from `main` into `integration`, after which each AI rebases its branch on `integration`.

## From AI-2
| Request | Decision |
|---------|----------|
| `DeviceSessionRepository` | ACCEPTED exactly as requested, in `contracts/v1_1.ts`. AI-1 creates table `auth_devices` in the 1000 range. RLS: a member reads own rows, writes only through the server role. |
| `RATE_LIMIT_HMAC_SECRET` | ACCEPTED. Added to `contracts/env.md` and `.env.example`. AI-1 adds it to `lib/env.ts` as required, at least 32 random bytes. |
| `tests/security/` ownership | ACCEPTED. Added to AI-2 in `CODEOWNERS`. |
| `WebhookVerifier` algorithm set at construction | APPROVED. The frozen interface is unchanged. |
| Email only login at launch | RECORDED as an owner decision. `phoneSchema` stays for the optional profile field. |
| Legacy README test credentials | OPEN, owner action: if those accounts exist in any Supabase project, delete them or rotate the passwords now. |

## From AI-4
| Item | Decision |
|------|----------|
| CR-1 provider access code | ACCEPTED as `PaymentAttemptV11.providerAccessCode` and `patch.providerAccessCode` on `PaymentAttemptRepositoryV11.transition`. Server side only. |
| CR-2 balance after entry | ACCEPTED as `LedgerEntryV11.balanceAfterKobo`, set by `post` inside the locked transaction. |
| CR-3 attempts by obligation | ACCEPTED as `listByObligation`, oldest first. |
| CR-4 active plans | ACCEPTED as `PlanRepositoryV11.listActive`. |
| CR-5 refunds by attempt | ACCEPTED as `RefundRepositoryV11.listByAttempt`. |
| CR-6 `listDue` | CONFIRMED. Obligations with status `scheduled` or `due` and `dueOn <= onOrBefore`, ordered by `dueOn` then `id` so cursors stay stable. |
| CR-7 payout OTP storage | ACCEPTED as a separate `PayoutOtpRepository`. AI-1 owns the table. One active code per payout, hashed with `OTP_PEPPER`, expiry, limited attempts, single use. |
| Q1 receipt number collision | `LedgerRepository.post` throws a typed error on a unique violation and AI-4 retries with a new number, at most 3 times. If `contracts/errors.ts` has no code for it, the Integrator adds `LEDGER_RECEIPT_CONFLICT` as an additive change. |
| Q2 forged webhooks | Store only verified events. Forged ones become rate limited security events. The `signatureValid` argument stays in the contract and is always true for stored rows. |
| Q3 settings seeds | AGREED. Money limit keys are seeded with no value. `refund.enabled` seeded as off. A service that needs a missing limit fails closed with a clear not configured error. |
| The 12 database requirements in `ai4-to-ai1-database-requirements.md` | AI-1 must confirm each one in its first migration pull request. AI-1 may not silently skip any. |

## From AI-5
| # | Decision |
|---|----------|
| 1 Support | ACCEPTED as `SupportServiceV11` plus `SupportRepositoryV11.getTicket`. Permissions already exist: `admin.support.read`, `admin.support.reply`. |
| 2 Privacy requests | ACCEPTED as `PrivacyServiceV11` and `PrivacyRequestRepositoryV11` (compare and set status). Permission `admin.privacy.manage`. |
| 2 Deletion with balance or ledger history | INTERIM rule, OPEN for owner and legal confirmation: a deletion request can be approved only when the balance is zero and there is no open payout or refund. Approval anonymizes name, phone and email, revokes sessions and saved methods, and keeps ledger rows (immutable, ADR-003) attached to the anonymized record. Otherwise the request stays `in_review` with a stated reason. The privacy policy must state the retention basis. Needs a qualified Nigerian lawyer before launch. |
| 3 Policies | ACCEPTED as `PolicyServiceV11.listUnaccepted` and `publish`, and `PolicyRepositoryV11.publish`. New versions start with `draft: true` until legal sign off. Publishing is audited. |
| 4 Announcements | CONFIRMED: AI-5 owns `AnnouncementService`. Fan out in batches, idempotent per announcement and member. |
| 5 Counts | ACCEPTED as `AdminCountsRepository`. AI-1 implements with aggregate queries and indexes. Read only. |
| 6 Admin members | DECIDED: screens never call `MemberRepository` directly. `AdminMemberService` is in the contract and AI-5 implements it in `lib/admin/`. `lib/admin/` is added to AI-5 in `CODEOWNERS`. |
| 7 Banks and account name | DECIDED: AI-4 owns `BankDirectoryService` through the provider adapter. Confirm endpoints in the provider's official docs. The resolved account name is shown to the member for confirmation before a withdrawal continues. |
| 8 `/admin/login` | CONFIRMED. AI-5 builds only the entry page. It calls `AuthService` with MFA required and reuses AI-3 auth components. |

## Dependencies between workstreams right now
1. AI-1 is the blocker. Nothing real can be persisted until its migrations land. AI-1 delivers first: migrations for identity, payments and ledger (with the 12 AI-4 requirements), RLS tests, `lib/db/`, `lib/env.ts`, then everything else.
2. AI-1 must implement the V11 repositories: `PaymentAttemptRepositoryV11`, `LedgerRepositoryV11`, `PlanRepositoryV11`, `RefundRepositoryV11`, `PayoutOtpRepository`, `AdminCountsRepository`, `DeviceSessionRepository`, `SupportRepositoryV11`, `PrivacyRequestRepositoryV11`, `PolicyRepositoryV11`.
3. AI-2, AI-4, AI-5 keep working against interfaces with test doubles in `tests/` only.

## Lockfile and CI
AI-2 reported that `npm ci` failed because `package-lock.json` was out of sync. `main` now has a lockfile, but nobody has confirmed `npm ci` passes. CI runs `npm ci` first, so the first run settles it. If it fails, the Integrator regenerates the lockfile and commits it. Nobody else touches `package-lock.json`.
The CI workflow is in `docs/ops/ci-workflow.yml` and must be copied to `.github/workflows/ci.yml` by the repository owner, because the Integrator's GitHub connection is not allowed to write workflow files.
