import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * PROMPT 3 (Distributor Request Page + Manual Product-wise Inventory
 * Management) — HTTP-level tests for the new "Add Inventory" single-step
 * stock addition (`POST /stock-adjustments/quick-add`). Covers exactly the
 * scenarios the spec calls out by name: the atomic math (Part 13/18), race
 * safety under real concurrency (Part 18/32), zero-stock recovery (Part
 * 22/33), input validation (Part 17), and role-based authorization (Part
 * 24/34) — Customer/Distributor forbidden, Admin/Super Admin allowed.
 */
describe('Admin Inventory — quick add stock (Prompt: Distributor Request + Inventory)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
  let WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
  let BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
  let StockAdjustmentModel: typeof import('../modules/inventory/models/stock-adjustment.model').StockAdjustmentModel;
  let StockMovementModel: typeof import('../modules/inventory/models/stock-movement.model').StockMovementModel;
  let RoleModel: typeof import('../modules/auth/models/role.model').RoleModel;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    ({ ProductModel } = await import('../modules/catalog/models/product.model'));
    ({ WarehouseModel } = await import('../modules/inventory/models/warehouse.model'));
    ({ BatchModel } = await import('../modules/inventory/models/batch.model'));
    ({ StockAdjustmentModel } = await import('../modules/inventory/models/stock-adjustment.model'));
    ({ StockMovementModel } = await import('../modules/inventory/models/stock-movement.model'));
    ({ RoleModel } = await import('../modules/auth/models/role.model'));
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  async function seedProductAndBatch(quantityAvailable: number) {
    const warehouse = await WarehouseModel.create({ name: 'Test Warehouse', code: 'TW1' });
    const product = await ProductModel.create({
      name: 'Test Karien Inventory Product',
      slug: `test-karien-inv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sku: 'TEST-KARIEN-INV-001',
      categoryId: new m.mongoose.Types.ObjectId(),
      basePrice: 100,
      mrp: 120,
    });
    const batch = await BatchModel.create({
      productId: product._id,
      warehouseId: warehouse._id,
      batchNumber: 'BATCH-001',
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantityReceived: Math.max(quantityAvailable, 1),
      quantityAvailable,
      unitCost: 50,
    });
    return { product, warehouse, batch };
  }

  async function seedSuperAdmin() {
    const superAdmin = await createCustomer(m.UserModel, { name: 'Super Admin', role: 'super_admin' });
    return { superAdmin, token: bearerFor(m.signAccessToken, superAdmin) };
  }

  test('Super Admin can add stock — 10 + 5 = 15, persisted in DB', async () => {
    const { batch } = await seedProductAndBatch(10);
    const { token } = await seedSuperAdmin();

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5, reason: 'Fresh stock' });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.batch.quantityAvailable, 15);
    assert.equal(res.body.data.previousAvailable, 10);

    const updated = await BatchModel.findById(batch._id).lean();
    assert.equal(updated?.quantityAvailable, 15);

    const adjustment = await StockAdjustmentModel.findOne({ batchId: batch._id }).lean();
    assert.ok(adjustment, 'expected a StockAdjustment record');
    assert.equal(adjustment?.status, 'approved');
    assert.equal(adjustment?.quantityDelta, 5);

    const movement = await StockMovementModel.findOne({ batchId: batch._id }).lean();
    assert.ok(movement, 'expected a StockMovement ledger entry');
    assert.equal(movement?.quantity, 5);
    assert.equal(movement?.balanceAfter, 15);
    assert.equal(movement?.type, 'adjustment');
  });

  test('concurrent stock additions do not race — 10 +5 and +7 simultaneously ends at 22', async () => {
    const { batch } = await seedProductAndBatch(10);
    const { token } = await seedSuperAdmin();

    const [resA, resB] = await Promise.all([
      request(ctx.app)
        .post('/api/v1/stock-adjustments/quick-add')
        .set('Authorization', token)
        .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 }),
      request(ctx.app)
        .post('/api/v1/stock-adjustments/quick-add')
        .set('Authorization', token)
        .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 7 }),
    ]);

    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);

    const finalBatch = await BatchModel.findById(batch._id).lean();
    assert.equal(finalBatch?.quantityAvailable, 22, 'expected 10 + 5 + 7 = 22, no lost update');

    const movements = await StockMovementModel.find({ batchId: batch._id }).lean();
    assert.equal(movements.length, 2, 'expected one ledger entry per addition, not one overwriting the other');
  });

  test('zero stock recovers correctly after adding stock', async () => {
    const { batch, product } = await seedProductAndBatch(0);
    const { token } = await seedSuperAdmin();

    const zeroStock = await BatchModel.findById(batch._id).lean();
    assert.equal(zeroStock?.quantityAvailable, 0);

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 201);

    const restocked = await BatchModel.findById(batch._id).lean();
    assert.equal(restocked?.quantityAvailable, 5, 'product should be available again after adding stock');
    void product; // seeded for realism; the availability calc itself (batchRepository.getAvailableStockMap) is unchanged and reads this same field
  });

  test('rejects zero, negative, and decimal quantities (400)', async () => {
    const { batch } = await seedProductAndBatch(10);
    const { token } = await seedSuperAdmin();

    for (const quantity of [0, -5, 2.5]) {
      const res = await request(ctx.app)
        .post('/api/v1/stock-adjustments/quick-add')
        .set('Authorization', token)
        .send({ mode: 'existing_batch', batchId: String(batch._id), quantity });
      assert.equal(res.status, 400, `quantity=${quantity} should be rejected`);
    }

    const unchanged = await BatchModel.findById(batch._id).lean();
    assert.equal(unchanged?.quantityAvailable, 10, 'no rejected request should have touched stock');
  });

  test('rejects a nonexistent batch (404)', async () => {
    const { token } = await seedSuperAdmin();
    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(new m.mongoose.Types.ObjectId()), quantity: 5 });
    assert.equal(res.status, 404);
  });

  test('a Customer cannot add inventory (403)', async () => {
    const { batch } = await seedProductAndBatch(10);
    const customer = await createCustomer(m.UserModel, { name: 'Plain Customer' });
    const token = bearerFor(m.signAccessToken, customer);

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 403);

    const unchanged = await BatchModel.findById(batch._id).lean();
    assert.equal(unchanged?.quantityAvailable, 10);
  });

  test('a Distributor cannot add inventory unless explicitly authorized (403)', async () => {
    const { batch } = await seedProductAndBatch(10);
    const distributor = await createCustomer(m.UserModel, { name: 'A Distributor', role: 'distributor' });
    const token = bearerFor(m.signAccessToken, distributor);

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 403);
  });

  test('calling the API unauthenticated is rejected (401)', async () => {
    const { batch } = await seedProductAndBatch(10);
    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 401);
  });

  test('an authorized Platform Admin (inventory:update granted) can add inventory', async () => {
    await RoleModel.create({
      key: 'admin',
      name: 'Platform Admin',
      permissions: ['inventory:update'],
      isSystem: true,
    });
    const { batch } = await seedProductAndBatch(10);
    const admin = await createCustomer(m.UserModel, { name: 'Platform Admin User', role: 'admin' });
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 201);

    const updated = await BatchModel.findById(batch._id).lean();
    assert.equal(updated?.quantityAvailable, 15);
  });

  test('a Platform Admin WITHOUT inventory:update is forbidden (403)', async () => {
    await RoleModel.create({
      key: 'admin',
      name: 'Platform Admin',
      permissions: ['products:read'],
      isSystem: true,
    });
    const { batch } = await seedProductAndBatch(10);
    const admin = await createCustomer(m.UserModel, { name: 'Restricted Admin', role: 'admin' });
    const token = bearerFor(m.signAccessToken, admin);

    const res = await request(ctx.app)
      .post('/api/v1/stock-adjustments/quick-add')
      .set('Authorization', token)
      .send({ mode: 'existing_batch', batchId: String(batch._id), quantity: 5 });
    assert.equal(res.status, 403);
  });
});
