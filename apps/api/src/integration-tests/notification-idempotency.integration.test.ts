import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 20 Part 25/57's guarantee — enqueueNotification() with an
 * `idempotencyKey` must produce exactly ONE queued notification even when two
 * callers race — exercised here via REAL concurrent HTTP requests to the
 * actual Razorpay webhook route (POST /api/v1/webhooks/razorpay), not a
 * direct call into notification.service.ts. `notifyPaymentCaptured()`
 * (payment.service.ts) is the real production caller that sets
 * `idempotencyKey: PAYMENT_SUCCESS:<paymentId>` — Razorpay is documented to
 * sometimes redeliver the same webhook event, which is exactly the race this
 * test simulates by firing the identical signed payload twice at once.
 *
 * Prompt 2 (prepaid-only redesign) update — a Payment no longer has a
 * pre-existing Order attached to it (that was the OLD "order created before
 * payment" flow this whole redesign eliminates). This test now seeds the
 * Payment the way `createCheckoutIntent` actually would: via a real
 * `buildCheckoutDraft()` snapshot and no `orderId`, so the webhook's
 * `payment.captured` handling exercises the REAL `finalizePaymentIntoOrder`
 * path (order finalization + notification), not a stale pre-Prompt-2 shape.
 */
describe('Notification idempotency under real concurrent HTTP delivery', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
    BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
    CustomerAddressModel: typeof import('../modules/customers/models/customer-address.model').CustomerAddressModel;
    CartModel: typeof import('../modules/customers/models/cart.model').CartModel;
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
      { CustomerAddressModel },
      { CartModel },
      orderService,
    ] = await Promise.all([
      import('../modules/catalog/models/category.model'),
      import('../modules/catalog/models/product.model'),
      import('../modules/inventory/models/warehouse.model'),
      import('../modules/inventory/models/batch.model'),
      import('../modules/customers/models/customer-address.model'),
      import('../modules/customers/models/cart.model'),
      import('../modules/orders/order.service'),
    ]);
    extra = {
      CategoryModel,
      ProductModel,
      WarehouseModel,
      BatchModel,
      CustomerAddressModel,
      CartModel,
      buildCheckoutDraft: orderService.buildCheckoutDraft,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  function signWebhookBody(rawBody: string): string {
    return createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET as string).update(rawBody).digest('hex');
  }

  /** Seeds a Payment exactly the way createCheckoutIntent would — a real, validated draft snapshot, no pre-existing Order. */
  async function seedCheckoutIntent(customerId: unknown) {
    const category = await extra.CategoryModel.create({ name: 'Cat', slug: `cat-${Date.now()}-${Math.random()}` });
    const product = await extra.ProductModel.create({
      name: 'Paracetamol 500mg',
      slug: `p-${Date.now()}-${Math.random()}`,
      sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      categoryId: category._id,
      basePrice: 100,
      mrp: 100,
      gstRate: 5,
      isActive: true,
    });
    const warehouse = await extra.WarehouseModel.create({ name: 'WH', code: `WH-${Date.now()}-${Math.random()}` });
    await extra.BatchModel.create({
      productId: product._id,
      warehouseId: warehouse._id,
      batchNumber: `B-${Date.now()}-${Math.random()}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      quantityReceived: 10,
      quantityAvailable: 10,
      unitCost: 10,
    });
    const address = await extra.CustomerAddressModel.create({
      userId: customerId,
      label: 'Home',
      line1: 'Line 1',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9876543210',
    });
    await extra.CartModel.findOneAndUpdate(
      { userId: String(customerId) },
      { $push: { items: { productId: product._id, quantity: 1, priceAtAdd: 100 } } },
      { upsert: true },
    );

    const draft = await extra.buildCheckoutDraft(String(customerId), { addressId: String(address._id) });
    const razorpayOrderId = `order_${new m.mongoose.Types.ObjectId().toString()}`;
    const payment = await m.PaymentModel.create({
      razorpayOrderId,
      amount: Math.round(draft.totals.grandTotal * 100),
      status: 'pending',
      checkoutSnapshot: draft,
    });
    return { payment, razorpayOrderId };
  }

  test('two concurrent payment.captured webhook deliveries for the same payment enqueue only one notification', async () => {
    const customer = await createCustomer(m.UserModel, {
      name: 'Webhook Customer',
      email: `webhook-customer-${Date.now()}@example.test`,
    });

    const { payment, razorpayOrderId } = await seedCheckoutIntent(customer._id);
    const razorpayPaymentId = `pay_${new m.mongoose.Types.ObjectId().toString()}`;

    const event = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: razorpayPaymentId,
            order_id: razorpayOrderId,
            method: 'upi',
          },
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const signature = signWebhookBody(rawBody);

    const deliver = () =>
      request(ctx.app)
        .post('/api/v1/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
        .send(rawBody);

    // Fired concurrently — not sequentially — to actually exercise the race
    // (Promise.all, both requests in flight against the same real server at once).
    const [resOne, resTwo] = await Promise.all([deliver(), deliver()]);

    assert.equal(resOne.status, 200);
    assert.equal(resTwo.status, 200);

    // Prompt 2 — the webhook is also what finalizes the order in this test
    // (no frontend-verify call happens here); confirms the notification
    // idempotency guarantee holds on the SAME code path that now also does
    // order finalization, not just a bare payment-status update.
    const orderCount = await m.OrderModel.countDocuments({ paymentId: payment._id });
    assert.equal(orderCount, 1, 'exactly one order must be finalized despite the concurrent webhook delivery');

    const idempotencyKey = `PAYMENT_SUCCESS:${String(payment._id)}`;
    const queuedNotifications = await m.NotificationQueueModel.find({ idempotencyKey }).lean();

    assert.equal(
      queuedNotifications.length,
      1,
      `expected exactly one queued notification for idempotencyKey ${idempotencyKey}, found ${queuedNotifications.length}`,
    );
  });
});
