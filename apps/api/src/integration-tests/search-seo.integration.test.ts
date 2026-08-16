import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 23 — real HTTP-level verification of the Search/SEO/AEO/GEO
 * module: the full request pipeline (rate limiter -> Zod validation ->
 * SearchService -> ProductModel), the SEO Configuration gate + Super Admin
 * bypass, MongoDB operator-injection protection, and the public
 * sitemap.xml/robots.txt endpoints — mirrors
 * analytics-config-gate.integration.test.ts's harness (Prompt 22).
 */
describe('Search & SEO (Prompt 23)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let RoleModel: typeof import('../modules/auth/models/role.model').RoleModel;
  let CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
  let ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    ({ RoleModel } = await import('../modules/auth/models/role.model'));
    ({ CategoryModel } = await import('../modules/catalog/models/category.model'));
    ({ ProductModel } = await import('../modules/catalog/models/product.model'));
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

  async function seedCategoryAndProduct() {
    const category = await CategoryModel.create({ name: 'Pain Relief', slug: 'pain-relief' });
    const product = await ProductModel.create({
      name: 'Paracetamol 500mg',
      slug: 'paracetamol-500mg',
      sku: 'PARA500',
      categoryId: category._id,
      basePrice: 25,
      mrp: 30,
      medicine: { genericName: 'Paracetamol' },
      isActive: true,
    });
    await ProductModel.syncIndexes();
    return { category, product };
  }

  test('GET /search/products finds a real product by text query', async () => {
    const { product } = await seedCategoryAndProduct();
    const res = await request(ctx.app).get('/api/v1/search/products').query({ q: 'Paracetamol' });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((p: { _id: string }) => p._id === String(product._id)));
    assert.ok(res.body.meta.total >= 1);
  });

  test('GET /products/:slug resolves the SEO-friendly slug URL', async () => {
    const { product } = await seedCategoryAndProduct();
    const res = await request(ctx.app).get(`/api/v1/products/${product.slug}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data._id, String(product._id));
  });

  test('GET /products/:id still resolves the raw ObjectId (backward compatibility)', async () => {
    const { product } = await seedCategoryAndProduct();
    const res = await request(ctx.app).get(`/api/v1/products/${product._id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.slug, product.slug);
  });

  test('a MongoDB-operator-shaped categoryId is rejected, never reaches a Mongo query as an operator', async () => {
    await seedCategoryAndProduct();
    // Express/qs parses `categoryId[$ne]=null` into an OBJECT, not a string —
    // the Zod schema requires a plain string, so this must be rejected (400
    // VALIDATION_ERROR — this route's `validate()` middleware always
    // responds via ValidationError/400, not the 422 code Prompt 22's
    // date-range resolver happens to use elsewhere).
    const res = await request(ctx.app).get('/api/v1/search/products').query('categoryId[$ne]=null');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('an oversized query string is rejected (Part 39 abuse protection)', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/search/products')
      .query({ q: 'a'.repeat(500) });
    assert.equal(res.status, 400);
  });

  test('an oversized page/limit request is rejected rather than silently clamped past the schema bound', async () => {
    const res = await request(ctx.app).get('/api/v1/search/products').query({ limit: '99999' });
    assert.equal(res.status, 400);
  });

  test('GET /search/autocomplete returns matching product suggestions', async () => {
    await seedCategoryAndProduct();
    const res = await request(ctx.app).get('/api/v1/search/autocomplete').query({ q: 'Para' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  test('GET /sitemap.xml is publicly reachable and lists the product by SLUG, not raw _id', async () => {
    const { product } = await seedCategoryAndProduct();
    const res = await request(ctx.app).get('/sitemap.xml');
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`/products/${product.slug}`));
    assert.doesNotMatch(res.text, new RegExp(`/products/${product._id}`));
  });

  test('GET /robots.txt is publicly reachable and disallows private areas', async () => {
    const res = await request(ctx.app).get('/robots.txt');
    assert.equal(res.status, 200);
    assert.match(res.text, /Disallow: \/admin\//);
    assert.match(res.text, /Disallow: \/checkout/);
    assert.match(res.text, /Sitemap:/);
  });

  test('Super Admin disables sitemapEnabled -> sitemap.xml returns an EMPTY sitemap, not an error', async () => {
    const superAdmin = await seedSuperAdmin();
    const token = bearerFor(m.signAccessToken, superAdmin);

    const disableRes = await request(ctx.app)
      .patch('/api/v1/admin/seo/config')
      .set('Authorization', token)
      .send({ sitemapEnabled: false });
    assert.equal(disableRes.status, 200);

    const res = await request(ctx.app).get('/sitemap.xml');
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<url>/);
  });

  test('Super Admin disables robotsEnabled -> robots.txt becomes a strict deny-all', async () => {
    const superAdmin = await seedSuperAdmin();
    const token = bearerFor(m.signAccessToken, superAdmin);

    await request(ctx.app)
      .patch('/api/v1/admin/seo/config')
      .set('Authorization', token)
      .send({ robotsEnabled: false });

    const res = await request(ctx.app).get('/robots.txt');
    assert.equal(res.status, 200);
    assert.equal(res.text.trim(), 'User-agent: *\nDisallow: /'.trim());
  });

  test('a Platform Admin without configuration:update cannot change SEO configuration', async () => {
    const admin = await seedPlatformAdmin(['configuration:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .patch('/api/v1/admin/seo/config')
      .set('Authorization', token)
      .send({ sitemapEnabled: false });
    assert.equal(res.status, 403);
  });

  test('a Platform Admin with reports:read can view search analytics; without it, is rejected', async () => {
    const admin = await seedPlatformAdmin(['reports:read']);
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .get('/api/v1/admin/search/analytics/summary')
      .set('Authorization', token)
      .query({ preset: 'last30days' });
    assert.equal(res.status, 200);
    assert.ok('totalSearches' in res.body.data);

    // A DIFFERENT role key (User.role is a fixed enum — 'inventory_manager'
    // is the one other non-customer/non-super-admin role available) with
    // zero permissions — reusing 'admin' here would inherit the
    // 'reports:read' permission already granted to that role key above
    // (RBAC in this codebase resolves permissions per ROLE, not per user),
    // which would defeat the point of this assertion.
    await RoleModel.create({ key: 'inventory_manager', name: 'Inventory Manager', permissions: [] });
    const noPermAdmin = await createCustomer(m.UserModel, { name: 'No Perm Admin', role: 'inventory_manager' });
    const noPermToken = bearerFor(m.signAccessToken, noPermAdmin);
    const rejected = await request(ctx.app)
      .get('/api/v1/admin/search/analytics/summary')
      .set('Authorization', noPermToken);
    assert.equal(rejected.status, 403);
  });

  test('an admin PATCHing a product with SEO fields persists them and records a distinct SEO audit entry', async () => {
    const { product } = await seedCategoryAndProduct();
    await RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions: ['products:update'], isSystem: true });
    const admin = await createCustomer(m.UserModel, { name: 'Product Admin', role: 'admin' });
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .patch(`/api/v1/products/${product._id}`)
      .set('Authorization', token)
      .send({ seo: { metaTitle: 'Buy Paracetamol Online', metaDescription: 'Fast delivery.', canonicalUrl: 'https://example.com/products/paracetamol-500mg' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.seo.metaTitle, 'Buy Paracetamol Online');

    const { AuditLogModel } = await import('../modules/audit/models/audit-log.model');
    const seoAudit = await AuditLogModel.findOne({ action: 'PRODUCT_SEO_UPDATED', resourceId: String(product._id) });
    assert.ok(seoAudit, 'expected a PRODUCT_SEO_UPDATED audit record');
  });

  test('GET /products/:slug response includes real structured data with correct availability and no fake rating', async () => {
    const { product } = await seedCategoryAndProduct();
    const res = await request(ctx.app).get(`/api/v1/products/${product.slug}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.structuredData['@type'], 'Product');
    assert.equal(res.body.data.structuredData.offers.availability, 'https://schema.org/OutOfStock');
    assert.equal('aggregateRating' in res.body.data.structuredData, false);
  });
});
