import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACTOR_TYPES, ROLES } from '@medcommerce/shared';

import { actorTypeForRole, isAdminRole } from './actor-context.util';

test('actorTypeForRole maps admin-ish roles to PLATFORM_ADMIN, super_admin to SUPER_ADMIN, and customer to CUSTOMER', () => {
  assert.equal(actorTypeForRole(ROLES.SUPER_ADMIN), ACTOR_TYPES.SUPER_ADMIN);
  assert.equal(actorTypeForRole(ROLES.ADMIN), ACTOR_TYPES.PLATFORM_ADMIN);
  assert.equal(actorTypeForRole(ROLES.INVENTORY_MANAGER), ACTOR_TYPES.PLATFORM_ADMIN);
  assert.equal(actorTypeForRole(ROLES.CUSTOMER), ACTOR_TYPES.CUSTOMER);
});

test('isAdminRole is true only for super_admin/admin/inventory_manager', () => {
  assert.equal(isAdminRole(ROLES.SUPER_ADMIN), true);
  assert.equal(isAdminRole(ROLES.ADMIN), true);
  assert.equal(isAdminRole(ROLES.INVENTORY_MANAGER), true);
  assert.equal(isAdminRole(ROLES.CUSTOMER), false);
});
