import { ACTOR_TYPES, ROLES, type ActorType, type Role } from '@medcommerce/shared';

/**
 * Maps a User's `role` (RBAC field) to the coarser actor-context vocabulary
 * ( 10 Part 4) used on audit rows. Deliberately not 1:1 with `Role` —
 * `inventory_manager` is still a platform-admin-panel actor for audit
 * purposes, and there is no `seller` role yet (tracked separately in
 * docs/DEVELOPMENT_TASKS.md as AUTH-01/CAT-01) so ACTOR_TYPES.SELLER is
 * reserved, unused until that role exists.
 */
export function actorTypeForRole(role: Role): ActorType {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return ACTOR_TYPES.SUPER_ADMIN;
    case ROLES.ADMIN:
    case ROLES.INVENTORY_MANAGER:
      return ACTOR_TYPES.PLATFORM_ADMIN;
    case ROLES.CUSTOMER:
    case ROLES.DISTRIBUTOR:
    default:
      return ACTOR_TYPES.CUSTOMER;
  }
}

/** Roles allowed into the admin panel at all — the set Google account-linking is restricted to (see google-auth.service.ts). */
export const ADMIN_ROLES: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INVENTORY_MANAGER];

export function isAdminRole(role: Role): boolean {
  return (ADMIN_ROLES as string[]).includes(role);
}
