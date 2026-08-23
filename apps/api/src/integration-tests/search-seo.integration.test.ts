import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * real HTTP-level verification of the Search/SEO/AEO/GEO
 * module: the full request pipeline (rate limiter -> Zod validation ->
 * SearchService -> ProductModel), the SEO Configuration gate + Super Admin
 * bypass, MongoDB operator-injection protection, and the public
 * sitemap.xml/robots.txt endpoints — mirrors
 * analytics-config-gate.integration.test.ts's harness ( 22).
 */
describe('Search & SEO', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let RoleModel: typeof import('../modules/auth/models/role.model').RoleModel;
  let CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
  let ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
  let BrandModel: typeof import('../modules/catalog/models/brand.model').BrandModel;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    ({ RoleModel } = await import('../modules/auth/models/role.model'));
    ({ CategoryModel } = await import('../modules/catalog/models/category.model'));
    ({ ProductModel } = await import('../modules/catalog/models/product.model'));
    ({ BrandModel } = await import('../modules/catalog/models/brand.model'));
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
    // responds via ValidationError/400, not the 422 code  22's
    // date-range resolver happens to use elsewhere).
    const res = await request(ctx.app).get('/api/v1/search/products').query('categoryId[$ne]=null');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('an oversized query string is rejected (abuse protection)', async () => {
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

  /**
   * Root-cause regression coverage for the multi-word search bug: every
   * search entry point used to run the WHOLE query string as a single
   * phrase-substring regex, so a reordered query ("extra paracetamol") or a
   * query whose words are separated by other text in the real name
   * ("paracetamol caffeine" vs. "Paracetamol 500mg + Caffeine Tablets")
   * matched ZERO results — confirmed live against the dev DB before the fix
   * (`q=extra+paracetamol` → 0, `q=paracetamol+extra` → 1). These tests
   * pin the fixed AND-of-tokens behavior so it can't silently regress.
   */
  describe('multi-word search: narrowing, broadening, AND-token matching', () => {
    async function seedProgressiveDataset() {
      const category = await CategoryModel.create({ name: 'Pain Relief', slug: 'pain-relief-progressive' });
      const brand = await BrandModel.create({ name: 'ReliefMax', slug: 'reliefmax-test' });
      const products = await ProductModel.create([
        {
          name: 'Paracetamol 500mg Tablets',
          slug: 'paracetamol-500mg-tablets-progressive',
          sku: 'PARA-500-TAB-T',
          categoryId: category._id,
          brandId: brand._id,
          basePrice: 25,
          mrp: 30,
          medicine: { genericName: 'Paracetamol', strength: '500mg' },
          isActive: true,
        },
        {
          name: 'Paracetamol 500mg + Caffeine Tablets',
          slug: 'paracetamol-500mg-caffeine-tablets-progressive',
          sku: 'PARA-500-CAF-TAB-T',
          categoryId: category._id,
          brandId: brand._id,
          basePrice: 40,
          mrp: 48,
          medicine: { genericName: 'Paracetamol, Caffeine', strength: '500mg' },
          isActive: true,
        },
        {
          name: 'Paracetamol 650mg Tablets',
          slug: 'paracetamol-650mg-tablets-progressive',
          sku: 'PARA-650-TAB-T',
          categoryId: category._id,
          brandId: brand._id,
          basePrice: 32,
          mrp: 38,
          medicine: { genericName: 'Paracetamol', strength: '650mg' },
          isActive: true,
        },
        {
          name: 'Ibuprofen 200mg Tablets',
          slug: 'ibuprofen-200mg-tablets-progressive',
          sku: 'IBU-200-TAB-T',
          categoryId: category._id,
          basePrice: 28,
          mrp: 34,
          medicine: { genericName: 'Ibuprofen', strength: '200mg' },
          isActive: true,
        },
      ]);
      await ProductModel.syncIndexes();
      return { category, brand, products };
    }

    async function searchTotal(q: string) {
      const res = await request(ctx.app).get('/api/v1/search/products').query({ q });
      assert.equal(res.status, 200, `search for "${q}" should succeed`);
      return res.body.meta.total as number;
    }

    test('exact multi-word phrase match', async () => {
      await seedProgressiveDataset();
      const res = await request(ctx.app).get('/api/v1/search/products').query({ q: 'paracetamol 500mg' });
      assert.equal(res.status, 200);
      const names = res.body.data.map((p: { name: string }) => p.name);
      assert.ok(names.includes('Paracetamol 500mg Tablets'));
      assert.ok(names.includes('Paracetamol 500mg + Caffeine Tablets'));
      assert.equal(res.body.meta.total, 2);
    });

    test('REGRESSION: reordered tokens still match (root cause of the reported bug)', async () => {
      await seedProgressiveDataset();
      const inOrder = await request(ctx.app).get('/api/v1/search/products').query({ q: 'paracetamol extra' });
      // "extra" doesn't appear on any seeded product, so this is a control: 0 either way.
      assert.equal(inOrder.status, 200);

      const reordered = await request(ctx.app).get('/api/v1/search/products').query({ q: '500mg paracetamol' });
      assert.equal(reordered.status, 200);
      const names = reordered.body.data.map((p: { name: string }) => p.name);
      assert.ok(
        names.includes('Paracetamol 500mg Tablets'),
        'reordered query "500mg paracetamol" must still find "Paracetamol 500mg Tablets"',
      );
    });

    test('REGRESSION: non-contiguous tokens match across interrupting text', async () => {
      await seedProgressiveDataset();
      // "paracetamol caffeine" is NOT a contiguous substring of
      // "Paracetamol 500mg + Caffeine Tablets" — the old whole-phrase-regex
      // implementation returned 0 results for this exact query.
      const res = await request(ctx.app).get('/api/v1/search/products').query({ q: 'paracetamol caffeine' });
      assert.equal(res.status, 200);
      const names = res.body.data.map((p: { name: string }) => p.name);
      assert.deepEqual(names, ['Paracetamol 500mg + Caffeine Tablets']);
    });

    test('query narrowing: each added term keeps results the same size or smaller', async () => {
      await seedProgressiveDataset();
      const broad = await searchTotal('paracetamol');
      const narrower = await searchTotal('paracetamol 500');
      const narrowest = await searchTotal('paracetamol 500mg caffeine');
      assert.equal(broad, 3); // all 3 Paracetamol variants
      assert.equal(narrower, 2); // 500mg Tablets + 500mg+Caffeine
      assert.equal(narrowest, 1); // only the caffeine variant
      assert.ok(narrower <= broad);
      assert.ok(narrowest <= narrower);
    });

    test('MANDATORY REGRESSION: removing a term (backspace-equivalent) restores the broader result set', async () => {
      await seedProgressiveDataset();
      const narrow = await searchTotal('paracetamol 500mg caffeine');
      assert.equal(narrow, 1);

      // Simulates the user pressing Backspace to remove "caffeine".
      const afterBackspace = await searchTotal('paracetamol 500mg');
      assert.equal(afterBackspace, 2, 'removing "caffeine" must restore both 500mg products, not stay stuck at 1');

      // Simulates removing "500mg" too.
      const afterSecondBackspace = await searchTotal('paracetamol');
      assert.equal(afterSecondBackspace, 3, 'removing "500mg" must restore all 3 Paracetamol products');
    });

    test('brand name is a real search field (not just a display value)', async () => {
      await seedProgressiveDataset();
      const byBrandAlone = await searchTotal('reliefmax');
      assert.equal(byBrandAlone, 3, 'brand-only query should find every ReliefMax product (Ibuprofen has no brand)');

      const byBrandAndProduct = await searchTotal('reliefmax paracetamol 500mg');
      assert.equal(byBrandAndProduct, 2, 'brand + product terms should narrow to the matching subset');
    });

    test('case normalization: uppercase/mixed-case query matches identically to lowercase', async () => {
      await seedProgressiveDataset();
      const lower = await searchTotal('paracetamol 500mg');
      const upper = await searchTotal('PARACETAMOL 500MG');
      const mixed = await searchTotal('Paracetamol 500Mg');
      assert.equal(lower, 2);
      assert.equal(upper, 2);
      assert.equal(mixed, 2);
    });

    test('whitespace normalization: extra/leading/trailing spaces do not change results', async () => {
      await seedProgressiveDataset();
      const normal = await searchTotal('paracetamol 500mg');
      const extraSpaces = await searchTotal('  paracetamol    500mg  ');
      assert.equal(extraSpaces, normal);
    });

    test('empty query does not error and does not apply a text filter', async () => {
      await seedProgressiveDataset();
      const res = await request(ctx.app).get('/api/v1/search/products').query({ q: '' });
      assert.equal(res.status, 200);
      assert.ok(res.body.meta.total >= 4);
    });

    test('GET /search/autocomplete narrows and broadens the same way as the results page', async () => {
      await seedProgressiveDataset();
      const broad = await request(ctx.app).get('/api/v1/search/autocomplete').query({ q: 'paracetamol' });
      const narrow = await request(ctx.app).get('/api/v1/search/autocomplete').query({ q: 'paracetamol 500mg caffeine' });
      assert.equal(broad.status, 200);
      assert.equal(narrow.status, 200);
      assert.equal(broad.body.data.length, 3);
      assert.equal(narrow.body.data.length, 1);
      assert.equal(narrow.body.data[0].name, 'Paracetamol 500mg + Caffeine Tablets');

      // Broaden back — this is the exact acceptance criterion from Section 10/21.
      const afterBackspace = await request(ctx.app).get('/api/v1/search/autocomplete').query({ q: 'paracetamol 500mg' });
      assert.equal(afterBackspace.body.data.length, 2);
    });

    test('unrelated product family (Ibuprofen) is never returned for a Paracetamol query', async () => {
      await seedProgressiveDataset();
      const res = await request(ctx.app).get('/api/v1/search/products').query({ q: 'paracetamol' });
      const names = res.body.data.map((p: { name: string }) => p.name);
      assert.ok(!names.some((n: string) => n.includes('Ibuprofen')));
    });
  });
});
