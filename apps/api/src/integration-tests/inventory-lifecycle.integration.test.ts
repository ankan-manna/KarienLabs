import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import type Redis from 'ioredis';
import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 3 (inventory lifecycle) — real HTTP/DB/Redis-level tests against
 * the actual Express app, a real ephemeral MongoDB replica set, and a real
 * ephemeral Redis (same fixtures `prepaid-checkout.integration.test.ts`
 * uses). Focused specifically on what Prompt 2's tests didn't already
 * cover: concurrency/oversell prevention under REAL concurrent HTTP
 * requests (not mocked), combo required-quantity math, the new
 * pre-payment stock revalidation, the recalled-batch availability fix, and
 * the inventory-changed realtime event.
 */
describe('Inventory lifecycle (Prompt 3)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
    BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
    BundleModel: typeof import('../modules/catalog/models/bundle.model').BundleModel;
    BundleItemModel: typeof import('../modules/catalog/models/bundle-item.model').BundleItemModel;
    CustomerAddressModel: typeof import('../modules/customers/models/customer-address.model').CustomerAddressModel;
    CartModel: typeof import('../modules/customers/models/cart.model').CartModel;
    PaymentModel: typeof import('../modules/payments/models/payment.model').PaymentModel;
    buildCheckoutDraft: typeof import('../modules/orders/order.service').buildCheckoutDraft;
    resolveProductAvailability: typeof import('../modules/catalog/bundle.service').resolveProductAvailability;
    redis: typeof import('../config/redis').redis;
    INVENTORY_EVENTS_CHANNEL: typeof import('../modules/realtime/inventory-events').INVENTORY_EVENTS_CHANNEL;
  };

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    const [
      { CategoryModel },
      { ProductModel },
      { WarehouseModel },
      { BatchModel },
      { BundleModel },
      { BundleItemModel },
      { CustomerAddressModel },
      { CartModel },
      { PaymentModel },
      orderService,
      bundleService,
      redisConfig,
      inventoryEvents,
    ] = await Promise.all([
      import('../modules/catalog/models/category.model'),
      import('../modules/catalog/models/product.model'),
      import('../modules/inventory/models/warehouse.model'),
      import('../modules/inventory/models/batch.model'),
      import('../modules/catalog/models/bundle.model'),
      import('../modules/catalog/models/bundle-item.model'),
      import('../modules/customers/models/customer-address.model'),
      import('../modules/customers/models/cart.model'),
      import('../modules/payments/models/payment.model'),
      import('../modules/orders/order.service'),
      import('../modules/catalog/bundle.service'),
      import('../config/redis'),
      import('../modules/realtime/inventory-events'),
    ]);
    extra = {
      CategoryModel,
      ProductModel,
      WarehouseModel,
      BatchModel,
      BundleModel,
      BundleItemModel,
      CustomerAddressModel,
      CartModel,
      PaymentModel,
      buildCheckoutDraft: orderService.buildCheckoutDraft,
      resolveProductAvailability: bundleService.resolveProductAvailability,
      redis: redisConfig.redis,
      INVENTORY_EVENTS_CHANNEL: inventoryEvents.INVENTORY_EVENTS_CHANNEL,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  function razorpaySignature(orderId: string, paymentId: string): string {
    return createHmac('sha256', 'test-razorpay-key-secret').update(`${orderId}|${paymentId}`).digest('hex');
  }

  async function seedCategory() {
    return extra.CategoryModel.create({ name: 'Test Category', slug: `cat-${Date.now()}-${Math.random()}` });
  }

  async function seedProduct(categoryId: unknown, overrides: Record<string, unknown> = {}) {
    return extra.ProductModel.create({
      name: 'Test Product',
      slug: `p-${Date.now()}-${Math.random()}`,
      sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      categoryId,
      basePrice: 100,
      mrp: 120,
      gstRate: 12,
      isActive: true,
      ...overrides,
    });
  }

  async function seedBatch(productId: unknown, quantityAvailable: number, overrides: Record<string, unknown> = {}) {
    const warehouse = await extra.WarehouseModel.create({ name: 'WH1', code: `WH-${Date.now()}-${Math.random()}` });
    return extra.BatchModel.create({
      productId,
      warehouseId: warehouse._id,
      batchNumber: `B-${Date.now()}-${Math.random()}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantityReceived: quantityAvailable,
      quantityAvailable,
      unitCost: 10,
      ...overrides,
    });
  }

  async function seedAddress(userId: unknown) {
    return extra.CustomerAddressModel.create({
      userId,
      label: 'Home',
      line1: '221B Baker Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9876543210',
    });
  }

  async function addToCart(userId: string, productId: unknown, quantity = 1) {
    await extra.CartModel.findOneAndUpdate(
      { userId },
      { $push: { items: { productId, quantity, priceAtAdd: 100 } } },
      { upsert: true },
    );
  }

  async function seedCheckoutIntent(userId: string, addressId: unknown) {
    const draft = await extra.buildCheckoutDraft(userId, { addressId: String(addressId) });
    const amountInPaise = Math.round(draft.totals.grandTotal * 100);
    const razorpayOrderId = `order_test_${randomBytes(8).toString('hex')}`;
    const payment = await extra.PaymentModel.create({
      razorpayOrderId,
      amount: amountInPaise,
      status: 'pending',
      checkoutSnapshot: draft,
    });
    return { draft, payment, razorpayOrderId };
  }

  async function verifyPaymentRequest(token: string, razorpayOrderId: string) {
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);
    return request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature });
  }

  // ---------------------------------------------------------------------
  // Part 8/35 — concurrent purchases of the LAST unit of a normal SKU.
  // ---------------------------------------------------------------------
  test('two customers racing for the last unit of a normal SKU: exactly one order, stock never negative', async () => {
    const category = await seedCategory();
    const product = await seedProduct(category._id);
    await seedBatch(product._id, 1); // exactly one unit in the whole system

    const customerA = await createCustomer(m.UserModel);
    const customerB = await createCustomer(m.UserModel);
    const tokenA = bearerFor(m.signAccessToken, customerA);
    const tokenB = bearerFor(m.signAccessToken, customerB);
    const addressA = await seedAddress(customerA._id);
    const addressB = await seedAddress(customerB._id);
    await addToCart(String(customerA._id), product._id, 1);
    await addToCart(String(customerB._id), product._id, 1);

    const { razorpayOrderId: orderIdA } = await seedCheckoutIntent(String(customerA._id), addressA._id);
    const { razorpayOrderId: orderIdB } = await seedCheckoutIntent(String(customerB._id), addressB._id);

    const [resA, resB] = await Promise.all([
      verifyPaymentRequest(tokenA, orderIdA),
      verifyPaymentRequest(tokenB, orderIdB),
    ]);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    const statuses = [resA.body.data.status, resB.body.data.status].sort();
    assert.deepEqual(statuses, ['confirmed', 'processing'], 'exactly one must confirm, the other must safely reconcile — never both confirmed');

    const orderCount = await m.OrderModel.countDocuments({});
    assert.equal(orderCount, 1, 'exactly one order must exist across both customers');

    const batch = await extra.BatchModel.findOne({ productId: product._id }).lean();
    assert.equal(batch!.quantityAvailable, 0, 'stock must land at exactly 0, never negative');
  });

  // ---------------------------------------------------------------------
  // Part 9/35 — combo concurrency: two combo purchases whose COMBINED
  // required component quantity exceeds what's available.
  // ---------------------------------------------------------------------
  test('two customers racing for combo units whose combined requirement exceeds shared component stock: never both succeed', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct(category._id, { basePrice: 100, mrp: 100 });
    const sku2 = await seedProduct(category._id, { basePrice: 200, mrp: 200 });
    const comboProduct = await seedProduct(category._id, { basePrice: 250, mrp: 250 });
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 5); // the binding constraint: only 5 combo-units possible

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await extra.BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 250 });

    const availability = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(availability.get(String(comboProduct._id)), 5, 'sanity check: combo availability starts at 5');

    const customerA = await createCustomer(m.UserModel); // buys 4 combos
    const customerB = await createCustomer(m.UserModel); // buys 2 combos
    const tokenA = bearerFor(m.signAccessToken, customerA);
    const tokenB = bearerFor(m.signAccessToken, customerB);
    const addressA = await seedAddress(customerA._id);
    const addressB = await seedAddress(customerB._id);
    await addToCart(String(customerA._id), comboProduct._id, 4);
    await addToCart(String(customerB._id), comboProduct._id, 2);

    const { razorpayOrderId: orderIdA } = await seedCheckoutIntent(String(customerA._id), addressA._id);
    const { razorpayOrderId: orderIdB } = await seedCheckoutIntent(String(customerB._id), addressB._id);

    const [resA, resB] = await Promise.all([
      verifyPaymentRequest(tokenA, orderIdA),
      verifyPaymentRequest(tokenB, orderIdB),
    ]);

    const confirmedCount = [resA, resB].filter((r) => r.body.data.status === 'confirmed').length;
    assert.equal(confirmedCount, 1, '4+2=6 exceeds the 5 available — exactly one of the two purchases may fully succeed, never both');

    const orderCount = await m.OrderModel.countDocuments({});
    assert.equal(orderCount, 1);

    const sku2After = await extra.BatchModel.findOne({ productId: sku2._id }).lean();
    assert.ok(
      sku2After!.quantityAvailable === 1 || sku2After!.quantityAvailable === 3,
      `remaining SKU2 stock must reflect exactly ONE winner's consumption (5-4=1 or 5-2=3), got ${sku2After!.quantityAvailable}`,
    );
  });

  // ---------------------------------------------------------------------
  // Part 6/34 — combo availability with DIFFERING required quantities per
  // component, both at read time and after a real purchase.
  // ---------------------------------------------------------------------
  test('combo availability respects differing required quantities per component (Part 34 worked example)', async () => {
    const category = await seedCategory();
    const sku1 = await seedProduct(category._id, { basePrice: 50, mrp: 50 });
    const sku2 = await seedProduct(category._id, { basePrice: 30, mrp: 30 });
    const comboProduct = await seedProduct(category._id, { basePrice: 100, mrp: 100 });
    await seedBatch(sku1._id, 10); // required qty 2 -> floor(10/2) = 5
    await seedBatch(sku2._id, 20); // required qty 1 -> floor(20/1) = 20

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 100, isActive: true });
    await extra.BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 2, priceRatio: 0.7 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.3 },
    ]);
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 100 });

    const before = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(before.get(String(comboProduct._id)), 5, 'MIN(floor(10/2), floor(20/1)) = 5');

    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), comboProduct._id, 3);
    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');

    const sku1After = await extra.BatchModel.findOne({ productId: sku1._id }).lean();
    const sku2After = await extra.BatchModel.findOne({ productId: sku2._id }).lean();
    assert.equal(sku1After!.quantityAvailable, 4, '10 - 3*2 = 4');
    assert.equal(sku2After!.quantityAvailable, 17, '20 - 3*1 = 17');

    const after = await extra.resolveProductAvailability([String(comboProduct._id)]);
    assert.equal(after.get(String(comboProduct._id)), 2, 'MIN(floor(4/2), floor(17/1)) = 2');
  });

  // ---------------------------------------------------------------------
  // Part 22/23 — pre-payment stock revalidation at checkout-intent time.
  // ---------------------------------------------------------------------
  test('checkout-intent is rejected before any payment when cart quantity exceeds current available stock', async () => {
    const category = await seedCategory();
    const product = await seedProduct(category._id);
    await seedBatch(product._id, 5);

    const customer = await createCustomer(m.UserModel);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 6); // 6 requested, only 5 available

    await assert.rejects(
      () => extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) }),
      /only has 5 unit\(s\) available/,
    );

    const paymentCount = await extra.PaymentModel.countDocuments({});
    assert.equal(paymentCount, 0, 'no Payment/Razorpay order may be created for a request that fails validation');
  });

  // ---------------------------------------------------------------------
  // Part 27/G — a recalled batch must not inflate customer-visible/combo
  // availability (it's excluded from FEFO picking at finalize time too).
  // ---------------------------------------------------------------------
  test('a recalled batch is excluded from the canonical availability calculation', async () => {
    const category = await seedCategory();
    const product = await seedProduct(category._id);
    await seedBatch(product._id, 10, { recallFlag: true });

    const availability = await extra.resolveProductAvailability([String(product._id)]);
    assert.equal(availability.get(String(product._id)) ?? 0, 0, 'a fully-recalled product must show as unavailable, not "10 in stock"');

    await seedBatch(product._id, 3); // a second, non-recalled batch
    const availability2 = await extra.resolveProductAvailability([String(product._id)]);
    assert.equal(availability2.get(String(product._id)), 3, 'only the non-recalled batch counts');
  });

  // ---------------------------------------------------------------------
  // Part 13 — failed/cancelled payment must leave inventory byte-for-byte
  // unchanged (extends Prompt 2's "no order" assertion with an explicit
  // stock-number check).
  // ---------------------------------------------------------------------
  test('a failed payment leaves Batch.quantityAvailable completely unchanged', async () => {
    const category = await seedCategory();
    const product = await seedProduct(category._id);
    await seedBatch(product._id, 7);

    const customer = await createCustomer(m.UserModel);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 2);
    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);

    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const payload = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: razorpayPaymentId, order_id: razorpayOrderId, error_description: 'Card declined' } } },
    });
    const signature = createHmac('sha256', 'test-razorpay-webhook-secret').update(payload).digest('hex');
    await request(ctx.app).post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(payload);

    const batch = await extra.BatchModel.findOne({ productId: product._id }).lean();
    assert.equal(batch!.quantityAvailable, 7, 'a failed payment must never deduct stock — none was ever reserved to release');
  });

  // ---------------------------------------------------------------------
  // Part 16/17/18/19 — a successful finalize publishes an inventory-updated
  // event on the shared Redis channel for the product AND any combo that
  // contains it, and does so exactly once even under a duplicate race.
  // ---------------------------------------------------------------------
  test('a successful order finalization publishes inventory.updated for the product and any combo containing it', async () => {
    const category = await seedCategory();
    const component = await seedProduct(category._id, { basePrice: 50, mrp: 50 });
    const comboProduct = await seedProduct(category._id, { basePrice: 100, mrp: 100 });
    await seedBatch(component._id, 1); // exactly enough for ONE combo unit

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 100, isActive: true });
    await extra.BundleItemModel.create({ bundleId: bundle._id, componentProductId: component._id, quantity: 1, priceRatio: 1 });
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 100 });

    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), comboProduct._id, 1);
    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);

    const subscriber: Redis = extra.redis.duplicate();
    await subscriber.subscribe(extra.INVENTORY_EVENTS_CHANNEL);
    const received: string[] = [];
    subscriber.on('message', (_channel, message) => received.push(message));

    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');

    // publishInventoryUpdate is awaited inside finalizeOrderFromDraft, which
    // completes before the HTTP response is sent — but Redis pub/sub
    // delivery to a subscriber is itself asynchronous over the wire, so
    // give it a brief, bounded window before asserting.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await subscriber.unsubscribe();
    await subscriber.quit();

    assert.equal(received.length, 1, 'exactly one publish for this single finalize — never zero, never duplicated');
    const parsed = JSON.parse(received[0]) as { events: { productId: string; inStock: boolean }[] };
    const productIds = parsed.events.map((e) => e.productId).sort();
    assert.deepEqual(
      productIds,
      [String(comboProduct._id), String(component._id)].sort(),
      'must include BOTH the directly-purchased component AND the combo product that derives from it (reverse lookup)',
    );
    const componentEvent = parsed.events.find((e) => e.productId === String(component._id));
    const comboEvent = parsed.events.find((e) => e.productId === String(comboProduct._id));
    assert.equal(componentEvent!.inStock, false, 'component stock is now 0');
    assert.equal(comboEvent!.inStock, false, 'combo derived availability is now 0 too');
  });
});
