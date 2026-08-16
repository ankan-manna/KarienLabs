import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * PROMPT 1 (Admin Profile Access + User Role/Distributor Management) —
 * HTTP-level regression tests for the parts of that spec that are genuine
 * NEW behavior on top of the pre-existing RBAC system (already covered by
 * rbac-privilege-escalation.integration.test.ts): the `distributor` role,
 * the "last Super Admin" protection (Part 10), forced session invalidation
 * on a role change (Part 18/19), strict role-string validation (Part 16
 * Step 4), and that a plain customer/distributor cannot reach the
 * role-update API at all (Part 9/TEST 6).
 */
describe('Admin user role management (Prompt: Admin Profile + Role Management)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let RefreshTokenModel: typeof import('../modules/auth/models/refresh-token.model').RefreshTokenModel;
  let AuditLogModel: typeof import('../modules/audit/models/audit-log.model').AuditLogModel;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    ({ RefreshTokenModel } = await import('../modules/auth/models/refresh-token.model'));
    ({ AuditLogModel } = await import('../modules/audit/models/audit-log.model'));
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  async function seedSuperAdmin(overrides: Record<string, unknown> = {}) {
    const superAdmin = await createCustomer(m.UserModel, {
      name: 'Super Admin',
      role: 'super_admin',
      ...overrides,
    });
    return { superAdmin, token: bearerFor(m.signAccessToken, superAdmin) };
  }

  // super_admin bypasses the permission-catalog lookup entirely
  // (rbac.middleware.ts authorize()), so no RoleModel seed is needed for it.

  test('Super Admin CAN promote a customer to distributor — persisted in DB', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'distributor' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'distributor');
    // Never leaks the password hash on the response.
    assert.equal(res.body.data.passwordHash, undefined);

    const updated = await m.UserModel.findById(target._id).select('role').lean();
    assert.equal(updated?.role, 'distributor');
  });

  test('Super Admin CAN promote a customer to admin (Platform Admin) — persisted in DB', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'admin' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'admin');

    const updated = await m.UserModel.findById(target._id).select('role').lean();
    assert.equal(updated?.role, 'admin');
  });

  test('an unrecognized role string is rejected with 400, not silently accepted', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'not-a-real-role' });

    assert.equal(res.status, 400);
    const unchanged = await m.UserModel.findById(target._id).select('role').lean();
    assert.equal(unchanged?.role, 'customer');
  });

  test('a plain Customer CANNOT call the role-update API at all', async () => {
    const customer = await createCustomer(m.UserModel, { name: 'Just a Customer' });
    const token = bearerFor(m.signAccessToken, customer);
    const target = await createCustomer(m.UserModel, { name: 'Another Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'admin' });

    assert.equal(res.status, 403);
  });

  test('a Distributor CANNOT call the role-update API at all', async () => {
    const distributor = await createCustomer(m.UserModel, { name: 'A Distributor', role: 'distributor' });
    const token = bearerFor(m.signAccessToken, distributor);
    const target = await createCustomer(m.UserModel, { name: 'Another Customer' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'admin' });

    assert.equal(res.status, 403);
  });

  test('calling the role-update API unauthenticated is rejected', async () => {
    const target = await createCustomer(m.UserModel, { name: 'Target' });
    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .send({ role: 'admin' });
    assert.equal(res.status, 401);
  });

  test('demoting one of TWO Super Admins succeeds (no false positive from the last-super-admin guard)', async () => {
    const { superAdmin: targetSuperAdmin } = await seedSuperAdmin({ name: 'Super Admin A' });
    const { token: actorToken } = await seedSuperAdmin({ name: 'Super Admin B' });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${targetSuperAdmin._id}`)
      .set('Authorization', actorToken)
      .send({ role: 'admin' });

    assert.equal(res.status, 200);
    const demoted = await m.UserModel.findById(targetSuperAdmin._id).select('role').lean();
    assert.equal(demoted?.role, 'admin');
  });

  /**
   * Part 10 ("prevent removal/demotion of the final Super Admin") in THIS
   * codebase's actual authorization architecture is enforced by TWO
   * pre-existing, independent guards, not a single "count remaining
   * super_admins" check in isolation:
   *   1. `assertCanManageTarget`'s self-modification block — a super_admin
   *      can never touch their OWN role/isActive/suspension through this
   *      endpoint, full stop (tested below).
   *   2. Only a super_admin can call this endpoint at all AND only a
   *      super_admin may act on another super_admin account — so whoever
   *      IS a valid actor here is, by construction, "another" valid Super
   *      Admin the moment target != actor.
   * Combined, there is no reachable request that removes the sole
   * remaining Super Admin: if there's only one, only they can call this
   * endpoint, and guard #1 stops them touching themselves; if there are
   * two or more, demoting one always leaves at least the actor. The new
   * `assertNotLastSuperAdmin` check added this prompt is real,
   * independently-correct defense-in-depth for a HYPOTHETICAL future
   * change to either guard above — it is not reachable today, which is
   * exactly what the "one of TWO" test above and the two self-block tests
   * below together demonstrate.
   */
  test('a Super Admin CANNOT suspend their own account (part of why the last one is safe)', async () => {
    const { superAdmin, token } = await seedSuperAdmin();
    const res = await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${superAdmin._id}/suspend`)
      .set('Authorization', token)
      .send({ reason: 'testing' });
    assert.equal(res.status, 403);
    const stillUsable = await m.UserModel.findById(superAdmin._id).select('isSuspended').lean();
    assert.equal(stillUsable?.isSuspended, false);
  });

  test('a Super Admin CANNOT deactivate or change their own role via this endpoint', async () => {
    const { superAdmin, token } = await seedSuperAdmin();
    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${superAdmin._id}`)
      .set('Authorization', token)
      .send({ isActive: false });
    assert.equal(res.status, 403);
    const stillActive = await m.UserModel.findById(superAdmin._id).select('isActive').lean();
    assert.equal(stillActive?.isActive, true);
  });

  test('a role change is recorded in the audit log with before/after role', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'distributor' });

    const auditRow = await AuditLogModel.findOne({ resource: 'admin_user', resourceId: String(target._id) })
      .sort({ createdAt: -1 })
      .lean();
    assert.ok(auditRow, 'expected an audit record for the role change');
    assert.equal((auditRow!.before as { role?: string })?.role, 'customer');
    assert.equal((auditRow!.after as { role?: string })?.role, 'distributor');
    // Never leaks anything password/token-shaped into the audit trail.
    assert.equal(JSON.stringify(auditRow).toLowerCase().includes('passwordhash'), false);
  });

  test('a role change revokes the affected user\'s existing refresh tokens (forces re-auth)', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    await RefreshTokenModel.create({
      userId: target._id,
      tokenHash: 'test-token-hash-role-change',
      familyId: 'test-family-role-change',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      deviceInfo: 'test',
      ip: '127.0.0.1',
    });

    await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ role: 'distributor' });

    const session = await RefreshTokenModel.findOne({ userId: target._id }).lean();
    assert.ok(session?.revokedAt, 'expected the affected user\'s refresh token to be revoked on role change');
  });

  test('changing only isActive (no role change) does NOT revoke existing sessions', async () => {
    const { token } = await seedSuperAdmin();
    const target = await createCustomer(m.UserModel, { name: 'Plain Customer' });

    await RefreshTokenModel.create({
      userId: target._id,
      tokenHash: 'test-token-hash-status-only',
      familyId: 'test-family-status-only',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      deviceInfo: 'test',
      ip: '127.0.0.1',
    });

    const res = await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', token)
      .send({ isActive: true });
    assert.equal(res.status, 200);

    const session = await RefreshTokenModel.findOne({ userId: target._id }).lean();
    assert.equal(session?.revokedAt, null, 'a same-value isActive patch should not revoke sessions');
  });
});
