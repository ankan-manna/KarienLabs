import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Combo/Bundle catalog — real HTTP-level tests against the actual Express
 * app + a real, ephemeral MongoDB + Redis (same pattern as
 * customer-ownership.integration.test.ts). Covers the new business rules
 * added on top of the existing Bundle system: inactive/nested-component
 * rejection, Bundle.sellingPrice -> Product.basePrice sync, and the
 * bundle-aware `resolveProductAvailability` combo-stock formula
 * (MIN over components of floor(available / requiredQty)), consumed by
 * both the catalog listing (`GET /products`) and product detail
 * (`GET /products/:id`) endpoints.
 */
describe('Combo/Bundle catalog', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
    BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
    resolveProductAvailability: typeof import('../modules/catalog/bundle.service').resolveProductAvailability;
  };

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    const [{ CategoryModel }, { ProductModel }, { WarehouseModel }, { BatchModel }, bundleService] =
      await Promise.all([
        import('../modules/catalog/models/category.model'),
        import('../modules/catalog/models/product.model'),
        import('../modules/inventory/models/warehouse.model'),
        import('../modules/inventory/models/batch.model'),
        import('../modules/catalog/bundle.service'),
      ]);
    extra = {
      CategoryModel,
      ProductModel,
      WarehouseModel,
      BatchModel,
      resolveProductAvailability: bundleService.resolveProductAvailability,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  async function seedSuperAdmin() {
    const admin = await m.UserModel.create({
      name: 'Test Super Admin',
      email: `super-${Date.now()}-${Math.random()}@example.test`,
      passwordHash: 'x',
      role: 'super_admin',
      isActive: true,
    });
    return bearerFor(m.signAccessToken, admin);
  }

  async function seedCategory() {
    return extra.CategoryModel.create({ name: 'Test Category', slug: `cat-${Date.now()}-${Math.random()}` });
  }

  async function seedProduct(overrides: Record<string, unknown> = {}) {
    const category = (overrides.categoryId as unknown) ? null : await seedCategory();
    return extra.ProductModel.create({
      name: 'Component',
      slug: `p-${Date.now()}-${Math.random()}`,
      sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      categoryId: category?._id,
      basePrice: 100,
      mrp: 120,
      isActive: true,
      ...overrides,
    });
  }

  async function seedBatch(productId: unknown, quantityAvailable: number) {
    const warehouse = await extra.WarehouseModel.create({ name: 'WH1', code: `WH-${Date.now()}-${Math.random()}` });
    return extra.BatchModel.create({
      productId,
      warehouseId: warehouse._id,
      batchNumber: `B-${Date.now()}-${Math.random()}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantityReceived: quantityAvailable,
      quantityAvailable,
      unitCost: 10,
    });
  }

  // ---------------------------------------------------------------------
  // MODEL / VALIDATION
  // ---------------------------------------------------------------------

  test('valid combo: admin creates a bundle referencing an existing product SKU', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ name: 'SKU-1', basePrice: 100, mrp: 100, categoryId: category._id });
    const sku2 = await seedProduct({ name: 'SKU-2', basePrice: 200, mrp: 200, categoryId: category._id });
    const comboProduct = await seedProduct({ name: 'COMBO-1-2', basePrice: 999, mrp: 999, categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        isActive: true,
        items: [
          { componentProductId: String(sku1._id), quantity: 1 },
          { componentProductId: String(sku2._id), quantity: 1 },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.sellingPrice, 250);
    assert.equal(res.body.data.items.length, 2);
  });

  test('price rule: Bundle.sellingPrice is synced onto Product.basePrice, component prices untouched', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ name: 'SKU-1', basePrice: 100, mrp: 100, categoryId: category._id });
    const sku2 = await seedProduct({ name: 'SKU-2', basePrice: 200, mrp: 200, categoryId: category._id });
    const comboProduct = await seedProduct({ name: 'COMBO-1-2', basePrice: 0, mrp: 300, categoryId: category._id });

    await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [
          { componentProductId: String(sku1._id), quantity: 1 },
          { componentProductId: String(sku2._id), quantity: 1 },
        ],
      });

    const refetchedCombo = await extra.ProductModel.findById(comboProduct._id).lean();
    assert.equal(refetchedCombo?.basePrice, 250, 'combo product basePrice must equal Bundle.sellingPrice, not the component sum (300)');

    const refetchedSku1 = await extra.ProductModel.findById(sku1._id).lean();
    const refetchedSku2 = await extra.ProductModel.findById(sku2._id).lean();
    assert.equal(refetchedSku1?.basePrice, 100, 'component product price must remain unchanged');
    assert.equal(refetchedSku2?.basePrice, 200, 'component product price must remain unchanged');
  });

  test('rejects a second bundle configuration for a product that already has one', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    const payload = {
      productId: String(comboProduct._id),
      sellingPrice: 250,
      items: [{ componentProductId: String(sku1._id), quantity: 1 }],
    };
    await request(ctx.app).post('/api/v1/bundles').set('Authorization', token).send(payload);
    const res = await request(ctx.app).post('/api/v1/bundles').set('Authorization', token).send(payload);
    assert.equal(res.status, 409);
  });

  test('rejects a duplicate component listed twice in the same bundle', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [
          { componentProductId: String(sku1._id), quantity: 1 },
          { componentProductId: String(sku1._id), quantity: 2 },
        ],
      });
    assert.equal(res.status, 422);
  });

  test('rejects a bundle containing itself as a component (self-reference)', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(comboProduct._id), quantity: 1 }],
      });
    assert.equal(res.status, 422);
  });

  test('rejects an inactive component product', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const inactiveSku = await seedProduct({ categoryId: category._id, isActive: false });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(inactiveSku._id), quantity: 1 }],
      });
    assert.equal(res.status, 422);
  });

  test('rejects a component that is itself a bundle/combo SKU (no nested combos)', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const innerComboProduct = await seedProduct({ categoryId: category._id });
    await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(innerComboProduct._id),
        sellingPrice: 150,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });

    const outerComboProduct = await seedProduct({ categoryId: category._id });
    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(outerComboProduct._id),
        sellingPrice: 300,
        items: [{ componentProductId: String(innerComboProduct._id), quantity: 1 }],
      });
    assert.equal(res.status, 422);
  });

  test('rejects an invalid (non-positive) component quantity', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 0 }],
      });
    assert.equal(res.status, 400);
  });

  test('rejects a negative combo selling price', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: -10,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    assert.equal(res.status, 400);
  });

  test('rejects a malformed componentProductId', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: 'not-a-valid-id', quantity: 1 }],
      });
    assert.equal(res.status, 400);
  });

  // ---------------------------------------------------------------------
  // BUSINESS LOGIC — combo stock derivation, exercised against real Batch data
  // ---------------------------------------------------------------------

  test('combo availability: SKU1=10, SKU2=5, qty 1 each -> combo=5', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const sku2 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    const { BundleModel } = await import('../modules/catalog/models/bundle.model');
    const { BundleItemModel } = await import('../modules/catalog/models/bundle-item.model');
    const bundle = await BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 5);

    const map = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(map.get(String(comboProduct._id)), 5);
  });

  test('combo availability: SKU1=10, SKU2=20, SKU3=7, qty 1 each -> combo=7', async () => {
    const category = await seedCategory();
    const [sku1, sku2, sku3, comboProduct] = await Promise.all([
      seedProduct({ categoryId: category._id }),
      seedProduct({ categoryId: category._id }),
      seedProduct({ categoryId: category._id }),
      seedProduct({ categoryId: category._id }),
    ]);
    const { BundleModel } = await import('../modules/catalog/models/bundle.model');
    const { BundleItemModel } = await import('../modules/catalog/models/bundle-item.model');
    const bundle = await BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.34 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.33 },
      { bundleId: bundle._id, componentProductId: sku3._id, quantity: 1, priceRatio: 0.33 },
    ]);
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 20);
    await seedBatch(sku3._id, 7);

    const map = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(map.get(String(comboProduct._id)), 7);
  });

  test('combo availability: required quantities differ — SKU1=10/qty2, SKU2=20/qty1 -> combo=5', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const sku2 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    const { BundleModel } = await import('../modules/catalog/models/bundle.model');
    const { BundleItemModel } = await import('../modules/catalog/models/bundle-item.model');
    const bundle = await BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 2, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 20);

    const map = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(map.get(String(comboProduct._id)), 5);
  });

  test('combo availability: zero stock on one component -> combo=0', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const sku2 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    const { BundleModel } = await import('../modules/catalog/models/bundle.model');
    const { BundleItemModel } = await import('../modules/catalog/models/bundle-item.model');
    const bundle = await BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await seedBatch(sku2._id, 20);
    // sku1 deliberately has NO batch at all (missing inventory record).

    const map = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(map.get(String(comboProduct._id)), 0);
  });

  test('an inactive bundle always resolves to 0 availability, regardless of component stock', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    const { BundleModel } = await import('../modules/catalog/models/bundle.model');
    const { BundleItemModel } = await import('../modules/catalog/models/bundle-item.model');
    const bundle = await BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: false });
    await BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 1 },
    ]);
    await seedBatch(sku1._id, 100);

    const map = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(map.get(String(comboProduct._id)), 0);
  });

  test('a plain (non-bundle) product still uses its own batch stock, unaffected by combo logic', async () => {
    const category = await seedCategory();
    const plain = await seedProduct({ categoryId: category._id });
    await seedBatch(plain._id, 42);

    const map = await extra.resolveProductAvailability([String(plain._id)]);
    assert.equal(map.get(String(plain._id)), 42);
  });

  // ---------------------------------------------------------------------
  // CATALOG VISIBILITY
  // ---------------------------------------------------------------------

  test('a combo appears in GET /products (All Products) with an authoritative inStock flag', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id, name: 'COMBO-VISIBLE' });
    await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    await seedBatch(sku1._id, 3);

    const res = await request(ctx.app).get('/api/v1/products').query({ page: 1, limit: 50 });
    assert.equal(res.status, 200);
    const found = (res.body.data as Array<{ _id: string; inStock: boolean }>).find(
      (p) => p._id === String(comboProduct._id),
    );
    assert.ok(found, 'the combo product must be present in the All Products listing');
    assert.equal(found?.inStock, true);
  });

  test('a combo with zero derived stock is NOT hidden from GET /products, but is flagged OUT_OF_STOCK (inStock: false)', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id, name: 'COMBO-OOS' });
    await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    // No batch seeded for sku1 -> zero component stock -> combo unavailable.

    const res = await request(ctx.app).get('/api/v1/products').query({ page: 1, limit: 50 });
    const found = (res.body.data as Array<{ _id: string; inStock: boolean }>).find(
      (p) => p._id === String(comboProduct._id),
    );
    assert.ok(found, 'an out-of-stock combo must still be listed, never hidden');
    assert.equal(found?.inStock, false);
  });

  test('GET /products/:id (product detail) correctly reports combo availability, not always Out of Stock', async () => {
    const token = await seedSuperAdmin();
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });
    await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    await seedBatch(sku1._id, 5);

    const res = await request(ctx.app).get(`/api/v1/products/${comboProduct._id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.inStock, true);
  });

  // ---------------------------------------------------------------------
  // REGRESSION — a plain product's listing/detail/stock is unaffected
  // ---------------------------------------------------------------------

  test('regression: a plain product still lists and reports stock correctly', async () => {
    const category = await seedCategory();
    const plain = await seedProduct({ categoryId: category._id, name: 'Plain Product' });
    await seedBatch(plain._id, 9);

    const listRes = await request(ctx.app).get('/api/v1/products').query({ page: 1, limit: 50 });
    const found = (listRes.body.data as Array<{ _id: string; inStock: boolean }>).find(
      (p) => p._id === String(plain._id),
    );
    assert.ok(found);
    assert.equal(found?.inStock, true);

    const detailRes = await request(ctx.app).get(`/api/v1/products/${plain._id}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.inStock, true);
  });

  // ---------------------------------------------------------------------
  // SECURITY / RBAC
  // ---------------------------------------------------------------------

  test('an unauthenticated request cannot create a bundle', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    assert.equal(res.status, 401);
  });

  test('a customer (no bundle permissions) cannot create a bundle', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const sku1 = await seedProduct({ categoryId: category._id });
    const comboProduct = await seedProduct({ categoryId: category._id });

    const res = await request(ctx.app)
      .post('/api/v1/bundles')
      .set('Authorization', token)
      .send({
        productId: String(comboProduct._id),
        sellingPrice: 250,
        items: [{ componentProductId: String(sku1._id), quantity: 1 }],
      });
    assert.equal(res.status, 403);
  });
});
