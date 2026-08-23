import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Part 16/64/71/72 — real HTTP-level regression tests for the
 * privilege-escalation gap found during this 's security audit:
 * an actor holding only `users:update`/`roles:update` (a plausible,
 * non-super_admin real-world delegation) could previously:
 *   1. create a brand-new super_admin account,
 *   2. promote an existing/own account to super_admin,
 *   3. suspend/reset-password on an EXISTING super_admin account,
 *   4. rewrite the super_admin role's own permission set,
 *   5. grant itself (or another account) a sensitive permission override
 *      (roles/users/configuration/audit_logs) to chain into the above.
 * Every scenario below must now be rejected (403), while the equivalent
 * SAME action performed by an actual super_admin must still succeed —
 * this file proves the fix closes the hole without breaking legitimate
 * Super Admin account-management functionality (Part 77's "no business
 * logic regression" requirement).
 */
describe('RBAC privilege-escalation protection', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let RoleModel: typeof import('../modules/auth/models/role.model').RoleModel;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    ({ RoleModel } = await import('../modules/auth/models/role.model'));
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  /** A "Platform Admin" role delegated ONLY users:update + roles:update — the exact plausible real-world grant the audit found exploitable. */
  async function seedUserManagerAdmin() {
    await RoleModel.create({
      key: 'admin',
      name: 'Platform Admin',
      permissions: ['users:update', 'roles:update'],
      isSystem: true,
    });
    const admin = await createCustomer(m.UserModel, { name: 'User Manager', role: 'admin' });
    return { admin, token: bearerFor(m.signAccessToken, admin) };
  }

  async function seedSuperAdmin() {
    const superAdmin = await createCustomer(m.UserModel, { name: 'Real Super Admin', role: 'super_admin' });
    return { superAdmin, token: bearerFor(m.signAccessToken, superAdmin) };
  }

  test('a Platform Admin with users:update CANNOT create a new super_admin account', async () => {
    const { token } = await seedUserManagerAdmin();
    const res = await request(ctx.app)
      .post('/api/v1/admin/rbac/users')
      .set('Authorization', token)
      .send({ name: 'Sneaky', email: 'sneaky@example.test', password: 'Str0ng-Passw0rd!', role: 'super_admin' });
    assert.equal(res.status, 403);

    const created = await m.UserModel.findOne({ email: 'sneaky@example.test' });
    assert.equal(created, null, 'no super_admin account should have been created');
  });

  test('a Super Admin CAN still create a new super_admin account (no regression)', async () => {
    const { token } = await seedSuperAdmin();
    const res = await request(ctx.app)
      .post('/api/v1/admin/rbac/users')
      .set('Authorization', token)
      .send({ name: 'Legit', email: 'legit@example.test', password: 'Str0ng-Passw0rd!', role: 'super_admin' });
    assert.equal(res.status, 201);
  });

  test('a Platform Admin with users:update CANNOT promote an existing account to super_admin', async () => {
    const { token } = await seedUserManagerAdmin();
    const victim = await createCustomer(m.UserModel, { name: 'Ordinary Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${victim._id}`)
      .set('Authorization', token)
      .send({ role: 'super_admin' });
    assert.equal(res.status, 403);

    const stillCustomer = await m.UserModel.findById(victim._id).select('role').lean();
    assert.equal(stillCustomer?.role, 'customer');
  });

  test('a Platform Admin with users:update CANNOT change their OWN role (self-escalation)', async () => {
    const { admin, token } = await seedUserManagerAdmin();
    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${admin._id}`)
      .set('Authorization', token)
      .send({ role: 'super_admin' });
    assert.equal(res.status, 403);
  });

  test('a Platform Admin with users:update CANNOT suspend an existing super_admin account', async () => {
    const { token } = await seedUserManagerAdmin();
    const { superAdmin } = await seedSuperAdmin();

    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${superAdmin._id}/suspend`)
      .set('Authorization', token)
      .send({ reason: 'testing' });
    assert.equal(res.status, 403);

    const stillActive = await m.UserModel.findById(superAdmin._id).select('isSuspended').lean();
    assert.equal(stillActive?.isSuspended, false);
  });

  test('a Platform Admin with users:update CANNOT reset an existing super_admin account password', async () => {
    const { token } = await seedUserManagerAdmin();
    const { superAdmin } = await seedSuperAdmin();

    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${superAdmin._id}/reset-password`)
      .set('Authorization', token)
      .send({ newPassword: 'Br4nd-New-Passw0rd!' });
    assert.equal(res.status, 403);
  });

  test('a Platform Admin with roles:update CANNOT rewrite the super_admin role\'s own permission set', async () => {
    const { token } = await seedUserManagerAdmin();
    const res = await request(ctx.app)
      .put('/api/v1/admin/rbac/roles/super_admin/permissions')
      .set('Authorization', token)
      .send({ permissions: ['users:update'] }); // attempting to DOWNGRADE super_admin's own role
    assert.equal(res.status, 403);

    const role = await RoleModel.findOne({ key: 'super_admin' }).lean();
    // Whatever the seeded permissions were, they must be UNCHANGED.
    assert.notDeepEqual(role?.permissions, ['users:update']);
  });

  test('a Super Admin CAN still edit the super_admin role (no regression)', async () => {
    await RoleModel.create({ key: 'super_admin', name: 'Super Admin', permissions: [], isSystem: true });
    const { token } = await seedSuperAdmin();
    const res = await request(ctx.app)
      .put('/api/v1/admin/rbac/roles/super_admin/permissions')
      .set('Authorization', token)
      .send({ permissions: ['users:update', 'roles:update'] });
    assert.equal(res.status, 200);
  });

  test('a Platform Admin CANNOT grant itself a sensitive (roles) permission override', async () => {
    const { admin, token } = await seedUserManagerAdmin();
    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${admin._id}/permissions`)
      .set('Authorization', token)
      .send({ permissionKey: 'roles:update', effect: 'grant' });
    assert.equal(res.status, 403);
  });

  test('a Platform Admin CANNOT grant another ordinary admin a sensitive (configuration) permission override', async () => {
    const { token } = await seedUserManagerAdmin();
    const accomplice = await createCustomer(m.UserModel, { name: 'Accomplice', role: 'admin' });

    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${accomplice._id}/permissions`)
      .set('Authorization', token)
      .send({ permissionKey: 'configuration:update', effect: 'grant' });
    assert.equal(res.status, 403);
  });

  test('a Platform Admin CAN still grant an ordinary (non-sensitive) permission to another user (no regression)', async () => {
    const { token } = await seedUserManagerAdmin();
    const otherAdmin = await createCustomer(m.UserModel, { name: 'Other Admin', role: 'admin' });

    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${otherAdmin._id}/permissions`)
      .set('Authorization', token)
      .send({ permissionKey: 'products:update', effect: 'grant' });
    assert.equal(res.status, 201);
  });

  test('an unrecognized permission key is rejected, not silently stored', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Target', role: 'admin' });

    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${target._id}/permissions`)
      .set('Authorization', token)
      .send({ permissionKey: 'not-a-real-permission', effect: 'grant' });
    assert.equal(res.status, 400);
  });

  test('granting/revoking a permission is audited', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Target', role: 'admin' });

    await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${target._id}/permissions`)
      .set('Authorization', token)
      .send({ permissionKey: 'products:update', effect: 'grant' });

    const { AuditLogModel } = await import('../modules/audit/models/audit-log.model');
    const auditRow = await AuditLogModel.findOne({ resource: 'user_permission', resourceId: String(target._id) });
    assert.ok(auditRow, 'expected an audit record for the permission grant');
  });
});
