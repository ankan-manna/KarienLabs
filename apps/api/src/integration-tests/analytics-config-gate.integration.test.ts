import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 22 — real HTTP-level verification that the analytics Configuration
 * gate (`requireAnalyticsEnabled`) actually blocks/allows requests through
 * the full middleware chain (auth -> RBAC -> config gate -> handler), not
 * just at the unit-tested service-function level. Mirrors the harness
 * customer-ownership.integration.test.ts already established.
 */
describe('Analytics Configuration gate (Prompt 22)', () => {
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

  async function seedPlatformAdmin(permissions: string[]) {
    await RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions, isSystem: true });
    return createCustomer(m.UserModel, { name: 'Platform Admin', role: 'admin' });
  }

  async function seedSuperAdmin() {
    return createCustomer(m.UserModel, { name: 'Super Admin', role: 'super_admin' });
  }

  test('a Platform Admin with reports:read CAN read /admin/reports/sales when analytics is enabled by default', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app).get('/api/v1/admin/reports/sales').set('Authorization', token);
    assert.equal(res.status, 200);
  });

  test('Super Admin disables salesAnalyticsEnabled -> Platform Admin is blocked from /admin/reports/sales', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const superAdmin = await seedSuperAdmin();
    const adminToken = bearerFor(m.signAccessToken, admin);
    const superAdminToken = bearerFor(m.signAccessToken, superAdmin);

    const disableRes = await request(ctx.app)
      .put('/api/v1/admin/reports/config')
      .set('Authorization', superAdminToken)
      .send({ salesAnalyticsEnabled: false });
    assert.equal(disableRes.status, 200);
    assert.equal(disableRes.body.data.salesAnalyticsEnabled, false);

    const blockedRes = await request(ctx.app)
      .get('/api/v1/admin/reports/sales')
      .set('Authorization', adminToken);
    assert.equal(blockedRes.status, 403);
    assert.equal(blockedRes.body.error.code, 'ANALYTICS_FEATURE_DISABLED');

    // A DIFFERENT domain (orders) must be UNAFFECTED — this is per-domain
    // gating, not an accidental global block.
    const ordersRes = await request(ctx.app)
      .get('/api/v1/admin/reports/orders')
      .set('Authorization', adminToken);
    assert.equal(ordersRes.status, 200);
  });

  test('Super Admin always bypasses the analytics Configuration gate, even when disabled', async () => {
    const superAdmin = await seedSuperAdmin();
    const superAdminToken = bearerFor(m.signAccessToken, superAdmin);

    await request(ctx.app)
      .put('/api/v1/admin/reports/config')
      .set('Authorization', superAdminToken)
      .send({ analyticsEnabled: false });

    const res = await request(ctx.app).get('/api/v1/admin/reports/sales').set('Authorization', superAdminToken);
    assert.equal(res.status, 200);
  });

  test('/admin/platform-health is blocked for a Platform Admin by default (platformHealthAnalyticsEnabled defaults OFF) even though reports:read is granted', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app).get('/api/v1/admin/platform-health').set('Authorization', token);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ANALYTICS_FEATURE_DISABLED');
  });

  test('/admin/platform-health becomes reachable for a Platform Admin once a Super Admin explicitly opts it in', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const superAdmin = await seedSuperAdmin();
    const adminToken = bearerFor(m.signAccessToken, admin);
    const superAdminToken = bearerFor(m.signAccessToken, superAdmin);

    await request(ctx.app)
      .put('/api/v1/admin/reports/config')
      .set('Authorization', superAdminToken)
      .send({ platformHealthAnalyticsEnabled: true });

    const res = await request(ctx.app).get('/api/v1/admin/platform-health').set('Authorization', adminToken);
    assert.equal(res.status, 200);
  });

  test('a Platform Admin WITHOUT reports:update cannot change analytics configuration (RBAC still enforced independently of the config gate)', async () => {
    const admin = await seedPlatformAdmin(['reports:read']); // read only, no update
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .put('/api/v1/admin/reports/config')
      .set('Authorization', token)
      .send({ salesAnalyticsEnabled: false });
    assert.equal(res.status, 403);
  });

  test('an unauthenticated request is rejected before ever reaching the config gate', async () => {
    const res = await request(ctx.app).get('/api/v1/admin/reports/sales');
    assert.equal(res.status, 401);
  });

  test('a plain customer (no admin permissions at all) is rejected by RBAC before the config gate', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);

    const res = await request(ctx.app).get('/api/v1/admin/reports/sales').set('Authorization', token);
    assert.equal(res.status, 403);
  });

  test('an invalid date-range preset returns 422 INVALID_DATE_RANGE, not a 500 or a silent full-collection scan', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .get('/api/v1/admin/reports/sales?preset=notARealPreset')
      .set('Authorization', token);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'INVALID_DATE_RANGE');
  });

  test('a custom range exceeding the max allowed days returns 422, not an unbounded query', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .get('/api/v1/admin/reports/sales?preset=custom&from=2015-01-01&to=2026-01-01')
      .set('Authorization', token);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'INVALID_DATE_RANGE');
  });

  test('exporting a report as Excel writes an audit record (ANALYTICS_REPORT_EXPORTED), an ordinary JSON read does not', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);
    const { AuditLogModel } = await import('../modules/audit/models/audit-log.model');

    await request(ctx.app).get('/api/v1/admin/reports/sales').set('Authorization', token);
    const beforeExportCount = await AuditLogModel.countDocuments({ action: 'ANALYTICS_REPORT_EXPORTED' });
    assert.equal(beforeExportCount, 0);

    const res = await request(ctx.app)
      .get('/api/v1/admin/reports/sales?format=excel')
      .set('Authorization', token);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] ?? '', /spreadsheetml/);

    const afterExportCount = await AuditLogModel.countDocuments({ action: 'ANALYTICS_REPORT_EXPORTED' });
    assert.equal(afterExportCount, 1);
  });
});
