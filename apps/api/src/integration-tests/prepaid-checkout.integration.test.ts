import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 2 (prepaid-only redesign) — real HTTP-level tests against the
 * actual Express app + a real, ephemeral MongoDB + Redis (same pattern as
 * customer-ownership.integration.test.ts / webhook-security.integration.test.ts).
 *
 * `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` in the test environment
 * (test-app.ts) are well-formed but DUMMY — not a real Razorpay account —
 * so `POST /payments/checkout-intent` (which genuinely calls Razorpay's
 * `orders.create` API) cannot be exercised end-to-end here. Instead, these
 * tests call `buildCheckoutDraft` directly (the exact same pure
 * validation/pricing function `createCheckoutIntent` calls internally) to
 * build a real draft, then seed a `Payment` document exactly the shape
 * `createCheckoutIntent` would have produced — and drive the REST of the
 * flow (verify / webhook / idempotency / races / reconciliation) through
 * the real HTTP endpoints, with a locally-computed valid HMAC signature
 * (same technique already used by webhook-security.integration.test.ts —
 * no Razorpay network call is needed to verify a signature, only to
 * CREATE an order or FETCH a payment, and the amount cross-check added in
 * this prompt is deliberately resilient to that fetch being unreachable —
 * see payment.service.ts::verifyAndCapturePayment). The full flow
 * INCLUDING real Razorpay order creation was additionally verified live in
 * a browser against real Razorpay TEST-MODE credentials — see the final
 * report.
 */
describe('Prepaid-only checkout/payment/order lifecycle', () => {
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
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  function razorpaySignature(orderId: string, paymentId: string): string {
    // Matches test-app.ts's RAZORPAY_KEY_SECRET.
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

  /** Bypasses createCheckoutIntent's real Razorpay call (see file header) — builds the real draft and seeds the Payment exactly as createCheckoutIntent would have. */
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

  async function fullCheckoutSetup(customer: { _id: unknown }, stock = 10) {
    const category = await seedCategory();
    const product = await seedProduct(category._id);
    await seedBatch(product._id, stock);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 1);
    return { category, product, address };
  }

  // ---------------------------------------------------------------------
  // 1. Cart -> payment success -> order created
  // ---------------------------------------------------------------------
  test('successful payment verification finalizes exactly one confirmed, paid order', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const { product } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), (await extra.CustomerAddressModel.findOne({ userId: customer._id }))!._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);

    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: signature,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'confirmed');
    assert.ok(res.body.data.orderId);

    const order = await m.OrderModel.findById(res.body.data.orderId).lean();
    assert.ok(order);
    assert.equal(order!.status, 'placed');
    assert.equal(order!.paymentStatus, 'captured');
    assert.equal(String(order!.paymentId), String(payment._id));
    assert.equal(order!.items[0].sku, product.sku);

    // Payment.orderId link maintained for admin/refund consumers.
    const refreshedPayment = await extra.PaymentModel.findById(payment._id).lean();
    assert.equal(String(refreshedPayment!.orderId), String(order!._id));
    assert.equal(refreshedPayment!.status, 'captured');
  });

  // ---------------------------------------------------------------------
  // 2. Cart -> payment cancel (never verified) -> NO order
  // ---------------------------------------------------------------------
  test('an abandoned/cancelled checkout-intent (never verified) never produces an order', async () => {
    const customer = await createCustomer(m.UserModel);
    const { address } = await fullCheckoutSetup(customer);
    const { payment } = await seedCheckoutIntent(String(customer._id), address._id);

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 0);

    const cart = await extra.CartModel.findOne({ userId: String(customer._id) }).lean();
    assert.equal(cart!.items.length, 1, 'cart must be untouched by a mere checkout-intent');
  });

  // ---------------------------------------------------------------------
  // 3. Cart -> payment failure (webhook) -> NO order
  // ---------------------------------------------------------------------
  test('a payment.failed webhook marks the payment failed and creates NO order', async () => {
    const customer = await createCustomer(m.UserModel);
    const { address } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;

    const payload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: razorpayPaymentId,
            order_id: razorpayOrderId,
            error_description: 'Card declined',
          },
        },
      },
    });
    const signature = createHmac('sha256', 'test-razorpay-webhook-secret').update(payload).digest('hex');

    const res = await request(ctx.app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(payload);
    assert.equal(res.status, 200);

    const refreshedPayment = await extra.PaymentModel.findById(payment._id).lean();
    assert.equal(refreshedPayment!.status, 'failed');
    assert.equal(refreshedPayment!.failureReason, 'Card declined');

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 0, 'a failed payment must never produce an order');

    const cart = await extra.CartModel.findOne({ userId: String(customer._id) }).lean();
    assert.equal(cart!.items.length, 1, 'cart must be preserved after a failed payment');
  });

  // ---------------------------------------------------------------------
  // 4/5/6. Idempotency — duplicate verify, duplicate webhook, and a
  // verify+webhook race must all converge on exactly ONE order.
  // ---------------------------------------------------------------------
  test('duplicate verify callbacks for the same payment produce exactly one order', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const { address } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);
    const body = { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature };

    const [res1, res2] = await Promise.all([
      request(ctx.app).post('/api/v1/payments/razorpay/verify').set('Authorization', token).send(body),
      request(ctx.app).post('/api/v1/payments/razorpay/verify').set('Authorization', token).send(body),
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(res1.body.data.orderId, res2.body.data.orderId, 'both calls must resolve to the SAME order');

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 1);
  });

  test('a repeated payment.captured webhook is a safe no-op after the order already exists', async () => {
    const customer = await createCustomer(m.UserModel);
    const { address } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: razorpayPaymentId, order_id: razorpayOrderId, method: 'card' } } },
    });
    const signature = createHmac('sha256', 'test-razorpay-webhook-secret').update(payload).digest('hex');

    await request(ctx.app).post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(payload);
    await request(ctx.app).post('/api/v1/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(payload);

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 1);
  });

  test('frontend-verify and webhook racing for the same payment converge on exactly one order', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const { address } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const verifySignature = razorpaySignature(razorpayOrderId, razorpayPaymentId);

    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: razorpayPaymentId, order_id: razorpayOrderId, method: 'card' } } },
    });
    const webhookSignature = createHmac('sha256', 'test-razorpay-webhook-secret').update(webhookPayload).digest('hex');

    await Promise.all([
      request(ctx.app)
        .post('/api/v1/payments/razorpay/verify')
        .set('Authorization', token)
        .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: verifySignature }),
      request(ctx.app)
        .post('/api/v1/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', webhookSignature)
        .send(webhookPayload),
    ]);

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 1, 'a frontend/webhook race must never create two orders');
  });

  // ---------------------------------------------------------------------
  // 7. Payment success + inventory race -> safe reconciliation, no order
  // ---------------------------------------------------------------------
  test('payment captured but stock ran out before finalization is safely reconciled, not silently oversold', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const { product, address } = await fullCheckoutSetup(customer, 5);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);

    // Stock disappears AFTER the checkout-intent snapshot was taken (e.g. a
    // different, faster checkout consumed it) — simulates the race Part 6/7
    // describes.
    await extra.BatchModel.updateMany({ productId: product._id }, { quantityAvailable: 0 });

    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);

    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'processing', 'must NEVER report false success or false failure — a safe processing state instead');
    assert.equal(res.body.data.orderId, null);

    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 0, 'no order may exist when stock could not be committed');

    const refreshedPayment = await extra.PaymentModel.findById(payment._id).lean();
    assert.equal(refreshedPayment!.status, 'captured', 'the money was genuinely captured — never misrepresented as failed');
    assert.ok(refreshedPayment!.reconciliationError, 'must be flagged for admin reconciliation');

    const stock = await extra.BatchModel.findOne({ productId: product._id }).lean();
    assert.equal(stock!.quantityAvailable, 0, 'the failed finalization attempt must not have mutated stock further (rolled back, not partially applied)');
  });

  // ---------------------------------------------------------------------
  // 8/9. Combo checkout — uses the Prompt 1 canonical combo price, and its
  // stock is validated via component availability.
  // ---------------------------------------------------------------------
  test('combo checkout charges the independently-set combo price, not the sum of component prices', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const sku1 = await seedProduct(category._id, { basePrice: 100, mrp: 100 });
    const sku2 = await seedProduct(category._id, { basePrice: 200, mrp: 200 });
    const comboProduct = await seedProduct(category._id, { basePrice: 999, mrp: 300 });
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 10);

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await extra.BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 250 });

    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), comboProduct._id, 1);

    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    assert.equal(payment.amount, Math.round((250 + 250 * 0.12) * 100), 'checkout-intent amount must reflect the combo price (250), not 300');

    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);
    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature });

    assert.equal(res.status, 200);
    const order = await m.OrderModel.findById(res.body.data.orderId).lean();
    assert.equal(order!.items[0].unitPrice, 250);
    assert.equal(order!.items[0].bundleComponents?.length, 2);
  });

  test('combo checkout is blocked by insufficient COMPONENT stock, using the canonical availability calculation', async () => {
    const customer = await createCustomer(m.UserModel);
    const category = await seedCategory();
    const sku1 = await seedProduct(category._id, { basePrice: 100, mrp: 100 });
    const comboProduct = await seedProduct(category._id, { basePrice: 250, mrp: 250 });
    await seedBatch(sku1._id, 0); // component has ZERO stock

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await extra.BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 1 },
    ]);
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 250 });

    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), comboProduct._id, 1);

    // Prompt 3 Part 22/23 — a checkout-intent for stock that's ALREADY known
    // to be insufficient is now rejected here, before any Razorpay order (and
    // therefore any charge) is ever created — strictly better than the old
    // behavior of taking the payment and only discovering the shortfall at
    // finalize time. (The genuine RACE case — stock disappearing AFTER a
    // valid checkout-intent was already created — is covered separately by
    // inventory-lifecycle.integration.test.ts, which still resolves via the
    // Part 24 reconciliation path this test used to exercise.)
    await assert.rejects(() => extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) }));

    const paymentCount = await extra.PaymentModel.countDocuments({});
    assert.equal(paymentCount, 0, 'no Payment/Razorpay order may be created for stock known to be insufficient');
    const orderCount = await m.OrderModel.countDocuments({});
    assert.equal(orderCount, 0);
  });

  // ---------------------------------------------------------------------
  // 12/13. Security / ownership
  // ---------------------------------------------------------------------
  test('a different customer cannot verify/finalize someone else\'s checkout-intent payment', async () => {
    const owner = await createCustomer(m.UserModel);
    const intruder = await createCustomer(m.UserModel);
    const intruderToken = bearerFor(m.signAccessToken, intruder);
    const { address } = await fullCheckoutSetup(owner);
    const { razorpayOrderId } = await seedCheckoutIntent(String(owner._id), address._id);
    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);

    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', intruderToken)
      .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature });

    assert.equal(res.status, 403);
  });

  test('an invalid Razorpay signature is rejected and finalizes nothing', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const { address } = await fullCheckoutSetup(customer);
    const { payment, razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);

    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: `pay_test_${randomBytes(8).toString('hex')}`,
        razorpay_signature: 'not-a-real-signature',
      });

    assert.equal(res.status, 400);
    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 0);
  });

  test('an unauthenticated verify request is rejected', async () => {
    const res = await request(ctx.app).post('/api/v1/payments/razorpay/verify').send({
      razorpay_order_id: 'order_x',
      razorpay_payment_id: 'pay_x',
      razorpay_signature: 'sig_x',
    });
    assert.equal(res.status, 401);
  });

  // ---------------------------------------------------------------------
  // Checkout-intent creation itself — validation still runs (Part 1),
  // even though the Razorpay order-creation call can't run against dummy
  // test credentials (see file header). Asserts the request is rejected
  // for a genuinely empty cart BEFORE any Razorpay call would happen.
  // ---------------------------------------------------------------------
  test('checkout-intent is rejected for an empty cart before any payment is initiated', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const address = await seedAddress(customer._id);

    const res = await request(ctx.app)
      .post('/api/v1/payments/checkout-intent')
      .set('Authorization', token)
      .send({ addressId: String(address._id) });

    assert.equal(res.status, 422);
  });
});
