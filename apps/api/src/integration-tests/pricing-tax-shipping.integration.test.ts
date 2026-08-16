import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test, type TestContext } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 30 (product-level GST/shipping + checkout total calculation) —
 * real HTTP/DB-level tests against the actual Express app and a real
 * ephemeral MongoDB (same fixtures every prior prompt's integration tests
 * use). Covers what's new in this prompt specifically: independent
 * per-product GST, the new product-level shipping charge (additive to the
 * pre-existing zone engine), combo commercial-value shipping, tampering
 * rejection, historical (post-catalog-edit) invoice immutability, and
 * rounding consistency across checkout/order/invoice.
 */
describe('Product-level GST/shipping + checkout totals (Prompt 5)', () => {
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
    InvoiceModel: typeof import('../modules/invoices/models/invoice.model').InvoiceModel;
    buildCheckoutDraft: typeof import('../modules/orders/order.service').buildCheckoutDraft;
    generateInvoiceForOrder: typeof import('../modules/invoices/invoice.service').generateInvoiceForOrder;
    regenerateInvoice: typeof import('../modules/invoices/invoice.service').regenerateInvoice;
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
      { InvoiceModel },
      orderService,
      invoiceService,
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
      import('../modules/invoices/models/invoice.model'),
      import('../modules/orders/order.service'),
      import('../modules/invoices/invoice.service'),
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
      InvoiceModel,
      buildCheckoutDraft: orderService.buildCheckoutDraft,
      generateInvoiceForOrder: invoiceService.generateInvoiceForOrder,
      regenerateInvoice: invoiceService.regenerateInvoice,
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

  /**
   * `generateInvoiceForOrder`/`regenerateInvoice` always attempt a REAL PDF
   * upload — this sandbox's `.env` happens to resolve `isS3Configured()` to
   * true (real S3 credentials are configured for the shared dev environment
   * — see Prompt 4's report) but has no outbound network access, so an
   * unmocked call fails with ECONNREFUSED. Stubs the storage boundary via
   * `s3Ops` (integrations/s3/s3-ops.ts, built in Prompt 4 specifically for
   * this) so these tests exercise the REAL tax/snapshot logic
   * (`calculateOrderTax`, immutability) while faking only the actual
   * network I/O.
   */
  async function mockS3Uploads(t: TestContext): Promise<void> {
    // `s3Ops` itself is a plain mutable object (not a frozen ES module
    // namespace) — mocking ITS OWN properties works fine via ordinary
    // dynamic `import()`, no `require()` workaround needed (unlike mocking
    // `storage.service.ts`/`s3.client.ts`'s own exports directly — see
    // s3-ops.ts's file header).
    const { s3Ops } = await import('../integrations/s3/s3-ops');
    t.mock.method(s3Ops, 'uploadDocument', async (input: { objectKey: string; buffer: Buffer }) => ({
      bucket: 'test-bucket',
      objectKey: input.objectKey,
      fileSize: input.buffer.byteLength,
    }));
    t.mock.method(s3Ops, 'getPresignedDownloadUrl', async (key: string) => `https://signed.example/${key}`);
  }

  // ---------------------------------------------------------------------
  // Part 9/35 — each line's GST computed from its OWN product rate.
  // ---------------------------------------------------------------------
  test('multi-product checkout computes each line GST independently, and checkout/payment/order/invoice totals all agree', async (t) => {
    await mockS3Uploads(t);
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const productA = await seedProduct(category._id, { basePrice: 100, mrp: 100, gstRate: 5 });
    const productB = await seedProduct(category._id, { basePrice: 200, mrp: 200, gstRate: 18 });
    await seedBatch(productA._id, 10);
    await seedBatch(productB._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), productA._id, 2); // 2 x ₹100 @5%
    await addToCart(String(customer._id), productB._id, 1); // 1 x ₹200 @18%

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    // subtotal = 200 + 200 = 400; gst = 200*0.05 + 200*0.18 = 10 + 36 = 46
    assert.equal(draft.totals.subtotal, 400);
    assert.equal(draft.totals.gst, 46);
    const lineA = draft.items.find((i) => (i as { sku: string }).sku === productA.sku) as { gstRate: number; amount: number };
    const lineB = draft.items.find((i) => (i as { sku: string }).sku === productB.sku) as { gstRate: number; amount: number };
    assert.equal(lineA.gstRate, 5);
    assert.equal(lineB.gstRate, 18);

    const amountInPaise = Math.round(draft.totals.grandTotal * 100);
    const razorpayOrderId = `order_test_${randomBytes(8).toString('hex')}`;
    const payment = await extra.PaymentModel.create({
      razorpayOrderId,
      amount: amountInPaise,
      status: 'pending',
      checkoutSnapshot: draft,
    });
    // Part 13/37 — payment order amount MUST equal the backend checkout total.
    assert.equal(payment.amount, amountInPaise);

    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');
    const order = await m.OrderModel.findById(res.body.data.orderId).lean();
    assert.equal(order!.totals!.grandTotal, draft.totals.grandTotal);

    await extra.generateInvoiceForOrder(String(order!._id));
    const invoice = await extra.InvoiceModel.findOne({ orderId: order!._id }).lean();
    assert.equal(invoice!.finalAmount, draft.totals.grandTotal, 'checkout, order, and invoice totals must be identical');
  });

  // ---------------------------------------------------------------------
  // Part 7/8/36 — product-level shipping charge, per-unit, additive across lines.
  // ---------------------------------------------------------------------
  test('product-level shipping charge is applied per unit and summed across lines', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const productA = await seedProduct(category._id, { basePrice: 100, mrp: 100, shippingCharge: 20 });
    const productB = await seedProduct(category._id, { basePrice: 200, mrp: 200, shippingCharge: 30 });
    await seedBatch(productA._id, 10);
    await seedBatch(productB._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), productA._id, 3); // 3 x ₹20 = ₹60
    await addToCart(String(customer._id), productB._id, 1); // 1 x ₹30 = ₹30

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    // No shipping zones configured in this test env, so the pre-existing
    // zone engine contributes 0 — the entire ₹90 is the NEW product-level
    // component, confirming it's genuinely additive and correctly summed.
    assert.equal(draft.totals.shipping, 90);

    const lineA = draft.items.find((i) => (i as { sku: string }).sku === productA.sku) as { shippingAmount: number };
    const lineB = draft.items.find((i) => (i as { sku: string }).sku === productB.sku) as { shippingAmount: number };
    assert.equal(lineA.shippingAmount, 60);
    assert.equal(lineB.shippingAmount, 30);

    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');
    const order = await m.OrderModel.findById(res.body.data.orderId).lean();
    assert.equal(order!.totals!.shipping, 90);
    const orderLineA = order!.items.find((i: { sku: string }) => i.sku === productA.sku) as unknown as { shippingAmount: number };
    assert.equal(orderLineA.shippingAmount, 60, 'per-line shippingAmount must be frozen onto the order item');
  });

  test('zero shipping charge and large quantities are handled correctly', async () => {
    const customer = await createCustomer(m.UserModel);
    const category = await seedCategory();
    const product = await seedProduct(category._id, { basePrice: 10, mrp: 10, shippingCharge: 0 });
    await seedBatch(product._id, 500);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 250);

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    assert.equal(draft.totals.shipping, 0, 'shippingCharge=0 must contribute nothing, not be silently defaulted to something else');
    assert.equal(draft.totals.subtotal, 2500);
  });

  // ---------------------------------------------------------------------
  // Part 10/34 — combo uses its OWN configured commercial shipping charge,
  // never summed from components (mirrors Prompt 1's price rule exactly).
  // ---------------------------------------------------------------------
  test('combo shipping charge uses the combo SKU\'s own configured value, not a sum of component shipping charges', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const sku1 = await seedProduct(category._id, { basePrice: 100, mrp: 100, shippingCharge: 50 });
    const sku2 = await seedProduct(category._id, { basePrice: 200, mrp: 200, shippingCharge: 70 });
    // Combo's OWN shipping charge is deliberately NOT 50+70=120 — proves
    // it's read from the combo product itself, not derived from components.
    const comboProduct = await seedProduct(category._id, { basePrice: 250, mrp: 300, shippingCharge: 15 });
    await seedBatch(sku1._id, 10);
    await seedBatch(sku2._id, 10);

    const bundle = await extra.BundleModel.create({ productId: comboProduct._id, sellingPrice: 250, isActive: true });
    await extra.BundleItemModel.create([
      { bundleId: bundle._id, componentProductId: sku1._id, quantity: 1, priceRatio: 0.5 },
      { bundleId: bundle._id, componentProductId: sku2._id, quantity: 1, priceRatio: 0.5 },
    ]);
    await extra.ProductModel.updateOne({ _id: comboProduct._id }, { isBundle: true, basePrice: 250 });

    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), comboProduct._id, 2); // 2 combos

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    assert.equal(draft.totals.subtotal, 500, 'combo commercial price (250) x 2, NOT (100+200) x 2 = 600');
    assert.equal(draft.totals.shipping, 30, "combo's own shippingCharge (15) x 2 = 30, NOT (50+70) x 2 = 240");

    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');
    const order = await m.OrderModel.findById(res.body.data.orderId).lean();
    assert.equal(order!.items[0].unitPrice, 250);
    assert.equal((order!.items[0] as unknown as { shippingAmount: number }).shippingAmount, 30);
    // Part 3 (Prompt 3) — inventory still consumes COMPONENT stock, unchanged.
    const sku1After = await extra.BatchModel.findOne({ productId: sku1._id }).lean();
    assert.equal(sku1After!.quantityAvailable, 8, 'component stock consumed per-combo-unit, unrelated to the commercial/shipping values above');
  });

  // ---------------------------------------------------------------------
  // Part 37/38/39/40 — tampering: checkout-intent has no request field for
  // price/GST/shipping/finalAmount at all, so a malicious client payload
  // is simply inert. Verified two ways: (a) the Zod DTO itself strips any
  // unknown key before it ever reaches buildCheckoutDraft (unit-level,
  // avoids depending on a real Razorpay order-creation call, which this
  // test environment's dummy credentials can't complete — see
  // prepaid-checkout.integration.test.ts's file header for the same,
  // already-established constraint); (b) buildCheckoutDraft's own computed
  // amount, called directly, comes out to the real DB-derived total
  // regardless of what a malicious client claims.
  // ---------------------------------------------------------------------
  test('a tampered checkout-intent request (extra price/gstRate/shippingCharge/finalAmount fields) is ignored — backend uses DB values', async () => {
    const { checkoutSchema } = await import('../modules/orders/order.validator');
    const parsed = checkoutSchema.parse({
      addressId: '507f1f77bcf86cd799439011',
      // None of these are real fields of the checkout-intent DTO.
      price: 1,
      basePrice: 1,
      gstRate: 0,
      shippingCharge: 0,
      finalAmount: 1,
    });
    assert.deepEqual(Object.keys(parsed).sort(), ['addressId'], 'every tampering field must be stripped by the DTO before reaching any service code');

    const customer = await createCustomer(m.UserModel);
    const category = await seedCategory();
    const product = await seedProduct(category._id, { basePrice: 100, mrp: 100, gstRate: 18, shippingCharge: 50 });
    await seedBatch(product._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 1);

    // Even calling the service layer directly with a legitimate-shaped
    // input, there is no parameter through which a price/GST/shipping
    // override could flow in the first place — the computed total is
    // ALWAYS derived from the DB-loaded product.
    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    // 100 (subtotal) + 18 (gst) + 50 (shipping) = 168 — the REAL DB-derived total.
    assert.equal(draft.totals.grandTotal, 168);
  });

  // ---------------------------------------------------------------------
  // Part 16/33 — historical order/invoice immutability after a catalog edit.
  // ---------------------------------------------------------------------
  test('an order and its invoice keep their ORIGINAL price/GST/shipping after the product is later edited', async (t) => {
    await mockS3Uploads(t);
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const product = await seedProduct(category._id, { basePrice: 100, mrp: 100, gstRate: 18, shippingCharge: 20 });
    await seedBatch(product._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 1);

    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');
    const orderId = res.body.data.orderId as string;

    await extra.generateInvoiceForOrder(orderId);

    // Admin now changes the product's commercial configuration.
    await extra.ProductModel.updateOne(
      { _id: product._id },
      { basePrice: 150, gstRate: 5, shippingCharge: 50 },
    );

    const order = await m.OrderModel.findById(orderId).lean();
    assert.equal(order!.items[0].unitPrice, 100, 'order item price must NOT follow the product edit');
    assert.equal(order!.items[0].gstRate, 18);
    assert.equal((order!.items[0] as unknown as { shippingAmount: number }).shippingAmount, 20);

    // Part 33 — regenerate the invoice AFTER the catalog edit; it must still
    // reflect the ORIGINAL order-time values, never today's product config.
    const regenerated = await extra.regenerateInvoice(orderId, String(customer._id));
    assert.equal(regenerated.items[0].unitPrice, 100);
    assert.equal(regenerated.items[0].gstRate, 18);
    assert.equal((regenerated.items[0] as unknown as { shippingAmount: number }).shippingAmount, 20);
    assert.equal(regenerated.totals!.grandTotal, order!.totals!.grandTotal);
  });

  // ---------------------------------------------------------------------
  // Part 19/41 — rounding: decimal-producing rates stay consistent across
  // checkout, order, and invoice.
  // ---------------------------------------------------------------------
  test('decimal-producing prices/rates round consistently across checkout, order, and invoice', async (t) => {
    await mockS3Uploads(t);
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const product = await seedProduct(category._id, { basePrice: 99.99, mrp: 99.99, gstRate: 12, shippingCharge: 7.5 });
    await seedBatch(product._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 3);

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    const { razorpayOrderId } = await seedCheckoutIntent(String(customer._id), address._id);
    const res = await verifyPaymentRequest(token, razorpayOrderId);
    assert.equal(res.body.data.status, 'confirmed');
    const order = await m.OrderModel.findById(res.body.data.orderId).lean();

    assert.equal(order!.totals!.grandTotal, draft.totals.grandTotal, 'checkout and order totals must match exactly, to the paisa');

    await extra.generateInvoiceForOrder(String(order!._id));
    const invoice = await extra.InvoiceModel.findOne({ orderId: order!._id }).lean();
    assert.equal(invoice!.finalAmount, order!.totals!.grandTotal, 'invoice total must reconcile exactly with the order total — no independent re-rounding');
  });
});
