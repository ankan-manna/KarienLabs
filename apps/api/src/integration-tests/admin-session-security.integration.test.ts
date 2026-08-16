import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 24 Part 63 — real HTTP-level regression test for the admin-session
 * gap found during the "is Prompt 24 done?" follow-up audit: `requireAuth`
 * previously trusted a JWT's embedded `{ sub, role }` for the token's full
 * 15-minute life with no re-check of the account's CURRENT active/
 * suspended state. A just-suspended (or self-deactivated) account could
 * keep using an already-issued access token until it naturally expired,
 * even though its refresh tokens were already revoked. Fixed with a
 * Redis-cached (60s TTL) account-status check inside `requireAuth`,
 * invalidated on every suspend/unsuspend/role-change/deactivate write.
 */
describe('Admin session security — account status invalidation (Prompt 24)', () => {
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

  async function seedSuperAdmin() {
    const superAdmin = await createCustomer(m.UserModel, { name: 'Super Admin', role: 'super_admin' });
    return { superAdmin, token: bearerFor(m.signAccessToken, superAdmin) };
  }

  test('a still-valid (unexpired) access token stops working the moment the account is suspended', async () => {
    await RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions: ['products:read'], isSystem: true });
    const target = await createCustomer(m.UserModel, { name: 'Soon Suspended', role: 'admin' });
    const targetToken = bearerFor(m.signAccessToken, target);
    const { token: superAdminToken } = await seedSuperAdmin();

    // The token works BEFORE suspension.
    const before = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(before.status, 200);

    await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${target._id}/suspend`)
      .set('Authorization', superAdminToken)
      .send({ reason: 'testing' });

    // The EXACT SAME still-cryptographically-valid, unexpired JWT is now rejected.
    const after = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(after.status, 401);
  });

  test('unsuspending immediately restores access with the same token', async () => {
    await RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions: ['products:read'], isSystem: true });
    const target = await createCustomer(m.UserModel, { name: 'Roundtrip', role: 'admin' });
    const targetToken = bearerFor(m.signAccessToken, target);
    const { token: superAdminToken } = await seedSuperAdmin();

    await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${target._id}/suspend`)
      .set('Authorization', superAdminToken)
      .send({ reason: 'testing' });
    const suspended = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(suspended.status, 401);

    await request(ctx.app)
      .post(`/api/v1/admin/rbac/users/${target._id}/unsuspend`)
      .set('Authorization', superAdminToken);

    const restored = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(restored.status, 200);
  });

  test('customer self-deactivation invalidates their own still-live access token', async () => {
    // createCustomer's default passwordHash is always for 'Test-Password-123!' — see fixtures.ts.
    const customer = await createCustomer(m.UserModel, { name: 'Self Deactivating' });
    const token = bearerFor(m.signAccessToken, customer);

    const before = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', token);
    assert.equal(before.status, 200);

    const deactivateRes = await request(ctx.app)
      .post('/api/v1/profile/me/deactivate')
      .set('Authorization', token)
      .send({ password: 'Test-Password-123!' });
    assert.equal(deactivateRes.status, 200);

    const after = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', token);
    assert.equal(after.status, 401);
  });

  test('an ordinary role/isActive PATCH also invalidates the cached account status (not just suspend)', async () => {
    await RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions: ['products:read'], isSystem: true });
    const target = await createCustomer(m.UserModel, { name: 'Deactivated via patch', role: 'admin' });
    const targetToken = bearerFor(m.signAccessToken, target);
    const { token: superAdminToken } = await seedSuperAdmin();

    const before = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(before.status, 200);

    await request(ctx.app)
      .patch(`/api/v1/admin/rbac/users/${target._id}`)
      .set('Authorization', superAdminToken)
      .send({ isActive: false });

    const after = await request(ctx.app).get('/api/v1/profile/me').set('Authorization', targetToken);
    assert.equal(after.status, 401);
  });
});
