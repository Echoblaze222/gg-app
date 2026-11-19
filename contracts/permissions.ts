/**
 * FROZEN CONTRACT: permission names for RBAC. Human readable list in contracts/permissions.md.
 * Format: <area>.<action>. The owner role holds all permissions. Members hold the member.* set.
 */
import type { Role } from "./enums";

export const PERMISSIONS = [
  // Member self service
  "member.profile.read",
  "member.profile.update",
  "member.plan.manage",
  "member.payment.create",
  "member.payment_method.manage",
  "member.history.read",
  "member.payout.request",
  "member.support.create",
  "member.privacy.request",
  "member.security.manage",

  // Admin: members
  "admin.members.read",
  "admin.members.suspend",
  "admin.members.update",

  // Admin: money
  "admin.contributions.read",
  "admin.payments.read",
  "admin.payments.refund",
  "admin.payouts.read",
  "admin.payouts.decide",
  "admin.ledger.adjust",
  "admin.reconciliation.read",
  "admin.reconciliation.resolve",

  // Admin: communication and support
  "admin.announcements.manage",
  "admin.support.read",
  "admin.support.reply",

  // Admin: security and system
  "admin.roles.read",
  "admin.roles.manage",
  "admin.security.read",
  "admin.audit.read",
  "admin.settings.read",
  "admin.settings.update",
  "admin.limits.update",
  "admin.policies.manage",
  "admin.privacy.manage",
] as const;

export type PermissionName = (typeof PERMISSIONS)[number];

const MEMBER_PERMISSIONS = PERMISSIONS.filter((p) => p.startsWith("member.")) as PermissionName[];

/** Default role to permission mapping seeded by migrations. Least privilege: support cannot touch money or roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly PermissionName[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter(
    (p) => p !== "admin.roles.manage" && p !== "admin.ledger.adjust" && p !== "admin.settings.update" && p !== "admin.limits.update",
  ),
  support: ["admin.members.read", "admin.support.read", "admin.support.reply", "admin.announcements.manage"],
  member: MEMBER_PERMISSIONS,
};

/** Admin actions that require the password to be confirmed again, even inside a valid session. */
export const REAUTH_REQUIRED_PERMISSIONS = [
  "admin.members.suspend",
  "admin.payments.refund",
  "admin.payouts.decide",
  "admin.ledger.adjust",
  "admin.reconciliation.resolve",
  "admin.roles.manage",
  "admin.settings.update",
  "admin.limits.update",
  "member.payout.request",
  "member.security.manage",
] as const satisfies readonly PermissionName[];
