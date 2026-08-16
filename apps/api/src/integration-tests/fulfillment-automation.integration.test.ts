import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 27 (post-payment fulfillment automation) — real HTTP/DB/Redis-level
 * tests against the actual Express app and a real ephemeral MongoDB/Redis
 * (same fixtures the Prompt 2/3 integration tests use). Covers what's new in
 * this prompt: fulfillment eligibility, the per-order automation trigger,
 * the sweep's self-pacing/distributed-lock behavior, the document retention
 * sweep, and transparent regeneration on an expired download — NOT the
 * invoice/Shiprocket/label generation internals themselves, which already
 * have their own coverage from earlier prompts and are reused unchanged
 * here.
 *
 * S3 network calls (`deleteObject`/`objectExists`) are stubbed via
 * `node:test`'s built-in per-test `t.mock` — this codebase has no
 * MinIO/AWS fixture available in the test environment (confirmed by
 * inspection: no existing test configures AWS_* credentials), so the S3
 * *transport* is faked while every DB-state transition around it runs for
 * real, matching the same "test what we control, disclose what we can't
 * reach" approach the Prompt 2 report used for live Razorpay order
 * creation.
 */
describe('Fulfillment automation (Prompt 4)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
    BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
    CustomerAddressModel: typeof import('../modules/customers/models/customer-address.model').CustomerAddressModel;
    CartModel: typeof import('../modules/customers/models/cart.model').CartModel;
    PaymentModel: typeof import('../modules/payments/models/payment.model').PaymentModel;
    InvoiceModel: typeof import('../modules/invoices/models/invoice.model').InvoiceModel;
    DocumentModel: typeof import('../modules/documents/models/document.model').DocumentModel;
    ConfigurationModel: typeof import('../modules/platform/models/configuration.model').ConfigurationModel;
    buildCheckoutDraft: typeof import('../modules/orders/order.service').buildCheckoutDraft;
    isOrderFulfillmentEligible: typeof import('../modules/orders/order-fulfillment-eligibility.service').isOrderFulfillmentEligible;
    processOrderFulfillmentAutomation: typeof import('../modules/orders/order-fulfillment-automation.service').processOrderFulfillmentAutomation;
    getFulfillmentConfig: typeof import('../modules/orders/fulfillment-config.service').getFulfillmentConfig;
    setFulfillmentConfig: typeof import('../modules/orders/fulfillment-config.service').setFulfillmentConfig;
    runFulfillmentAutomationSweepJob: typeof import('../queues/jobs/fulfillment-automation-sweep.job').runFulfillmentAutomationSweepJob;
    runDocumentRetentionSweepJob: typeof import('../queues/jobs/document-retention-sweep.job').runDocumentRetentionSweepJob;
    orderFulfillmentAutomationQueue: typeof import('../queues/queue').orderFulfillmentAutomationQueue;
    ensureInvoicePdfAvailable: typeof import('../modules/invoices/invoice.service').ensureInvoicePdfAvailable;
    getInvoiceDownloadUrl: typeof import('../modules/invoices/invoice.service').getInvoiceDownloadUrl;
    setPrescriptionConfig: typeof import('../modules/customers/prescription-config.service').setPrescriptionConfig;
    s3Ops: typeof import('../integrations/s3/s3-ops').s3Ops;
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
      { PaymentModel },
      { InvoiceModel },
      { DocumentModel },
      { ConfigurationModel },
      orderService,
      eligibilityService,
      automationService,
      fulfillmentConfigService,
      sweepJob,
      retentionJob,
      queueModule,
      invoiceService,
      prescriptionConfigService,
    ] = await Promise.all([
      import('../modules/catalog/models/category.model'),
      import('../modules/catalog/models/product.model'),
      import('../modules/inventory/models/warehouse.model'),
      import('../modules/inventory/models/batch.model'),
      import('../modules/customers/models/customer-address.model'),
      import('../modules/customers/models/cart.model'),
      import('../modules/payments/models/payment.model'),
      import('../modules/invoices/models/invoice.model'),
      import('../modules/documents/models/document.model'),
      import('../modules/platform/models/configuration.model'),
      import('../modules/orders/order.service'),
      import('../modules/orders/order-fulfillment-eligibility.service'),
      import('../modules/orders/order-fulfillment-automation.service'),
      import('../modules/orders/fulfillment-config.service'),
      import('../queues/jobs/fulfillment-automation-sweep.job'),
      import('../queues/jobs/document-retention-sweep.job'),
      import('../queues/queue'),
      import('../modules/invoices/invoice.service'),
      import('../modules/customers/prescription-config.service'),
    ]);
    // `s3Ops` (integrations/s3/s3-ops.ts) is a deliberately mockable
    // indirection layer — see its own file header. `t.mock.method` cannot
    // patch a named export of `s3.client.ts`/`storage.service.ts` directly
    // under this project's module loader (tsx runs everything as ESM under
    // the hood regardless of `import`/`require` syntax, so BOTH produce a
    // frozen, non-configurable module namespace — confirmed by inspecting
    // the property descriptor). `s3Ops` sidesteps this: it's a plain
    // mutable object, and mocking ITS OWN properties works normally.
    const { s3Ops } = await import('../integrations/s3/s3-ops');
    extra = {
      CategoryModel,
      ProductModel,
      WarehouseModel,
      BatchModel,
      CustomerAddressModel,
      CartModel,
      PaymentModel,
      InvoiceModel,
      DocumentModel,
      ConfigurationModel,
      buildCheckoutDraft: orderService.buildCheckoutDraft,
      isOrderFulfillmentEligible: eligibilityService.isOrderFulfillmentEligible,
      processOrderFulfillmentAutomation: automationService.processOrderFulfillmentAutomation,
      getFulfillmentConfig: fulfillmentConfigService.getFulfillmentConfig,
      setFulfillmentConfig: fulfillmentConfigService.setFulfillmentConfig,
      runFulfillmentAutomationSweepJob: sweepJob.runFulfillmentAutomationSweepJob,
      runDocumentRetentionSweepJob: retentionJob.runDocumentRetentionSweepJob,
      orderFulfillmentAutomationQueue: queueModule.orderFulfillmentAutomationQueue,
      ensureInvoicePdfAvailable: invoiceService.ensureInvoicePdfAvailable,
      getInvoiceDownloadUrl: invoiceService.getInvoiceDownloadUrl,
      setPrescriptionConfig: prescriptionConfigService.setPrescriptionConfig,
      s3Ops,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  // `setConfiguration`/`setPrescriptionConfig` persist `updatedBy: actorId` as
  // a real ObjectId-ref field — a plain string like "system" fails Mongoose
  // casting, so these test-only config writes use a syntactically-valid (if
  // otherwise meaningless) ObjectId, exactly as a real system/background-job
  // caller would need to.
  const systemActorId = '000000000000000000000001';

  beforeEach(async () => {
    await ctx.resetDatabase();
    // Every test starts from the DEFAULT fulfillment config (automation on,
    // fast-enough interval for the "due" tests) unless a test overrides it.
    await extra.setFulfillmentConfig(
      { automationEnabled: true, orderAdvancementEnabled: true, cronIntervalHours: 6, toleranceMinutes: 30, batchSize: 50 },
      systemActorId,
    );
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

  /** Produces a real, fully-finalized PAID order (PLACED + paymentStatus CAPTURED) by driving the actual Prompt 2/3 checkout+payment pipeline — never hand-crafted, so every eligibility/automation test exercises the REAL upstream shape. */
  async function seedPaidOrder(overrides: { prescriptionRequired?: boolean } = {}) {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);
    const category = await seedCategory();
    const product = await seedProduct(category._id, overrides.prescriptionRequired ? { 'medicine.prescriptionRequired': true } : {});
    await seedBatch(product._id, 10);
    const address = await seedAddress(customer._id);
    await addToCart(String(customer._id), product._id, 1);

    const draft = await extra.buildCheckoutDraft(String(customer._id), { addressId: String(address._id) });
    const razorpayOrderId = `order_test_${randomBytes(8).toString('hex')}`;
    const payment = await extra.PaymentModel.create({
      razorpayOrderId,
      amount: Math.round(draft.totals.grandTotal * 100),
      status: 'pending',
      checkoutSnapshot: draft,
    });

    const razorpayPaymentId = `pay_test_${randomBytes(8).toString('hex')}`;
    const signature = razorpaySignature(razorpayOrderId, razorpayPaymentId);
    const res = await request(ctx.app)
      .post('/api/v1/payments/razorpay/verify')
      .set('Authorization', token)
      .send({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature });

    assert.equal(res.body.data.status, 'confirmed', 'test setup: payment must confirm for these fulfillment tests to be meaningful');
    return { orderId: res.body.data.orderId as string, customer, payment };
  }

  // ---------------------------------------------------------------------
  // Part 4 — eligibility
  // ---------------------------------------------------------------------
  describe('isOrderFulfillmentEligible', () => {
    test('a freshly-paid order (PLACED + CAPTURED, no prescription) is eligible', async () => {
      const { orderId } = await seedPaidOrder();
      const order = await m.OrderModel.findById(orderId).lean();
      const result = await extra.isOrderFulfillmentEligible(order!);
      assert.equal(result.eligible, true);
    });

    test('an order already advanced past PLACED is not eligible (Part 26 — no reprocessing)', async () => {
      const { orderId } = await seedPaidOrder();
      await extra.processOrderFulfillmentAutomation(orderId); // advances to PACKED
      const order = await m.OrderModel.findById(orderId).lean();
      assert.equal(order!.status, 'packed');
      const result = await extra.isOrderFulfillmentEligible(order!);
      assert.equal(result.eligible, false);
      assert.match(result.reason ?? '', /placed/);
    });

    test('a prescription-required, unverified order is excluded when the order-blocking gate is enabled', async () => {
      const { orderId } = await seedPaidOrder({ prescriptionRequired: true });
      await extra.setPrescriptionConfig({ managementEnabled: true, orderBlockingEnabled: true }, systemActorId);
      const order = await m.OrderModel.findById(orderId).lean();
      assert.equal(order!.prescriptionRequired, true);
      assert.equal(order!.prescriptionVerified, false);
      const result = await extra.isOrderFulfillmentEligible(order!);
      assert.equal(result.eligible, false);
      assert.match(result.reason ?? '', /prescription/);
    });

    test('a prescription-required order is still eligible when the order-blocking gate is disabled', async () => {
      const { orderId } = await seedPaidOrder({ prescriptionRequired: true });
      await extra.setPrescriptionConfig({ managementEnabled: true, orderBlockingEnabled: false }, systemActorId);
      const order = await m.OrderModel.findById(orderId).lean();
      const result = await extra.isOrderFulfillmentEligible(order!);
      assert.equal(result.eligible, true);
    });
  });

  // ---------------------------------------------------------------------
  // Part 5/26 — per-order automation is idempotent
  // ---------------------------------------------------------------------
  describe('processOrderFulfillmentAutomation', () => {
    test('advances a paid order PLACED -> CONFIRMED -> PACKED', async () => {
      const { orderId } = await seedPaidOrder();
      await extra.processOrderFulfillmentAutomation(orderId);
      const order = await m.OrderModel.findById(orderId).lean();
      assert.equal(order!.status, 'packed');
      assert.equal(order!.statusHistory.some((h: { status: string }) => h.status === 'confirmed'), true);
      assert.equal(order!.statusHistory.some((h: { status: string }) => h.status === 'packed'), true);
    });

    test('calling it twice on the same order is a safe no-op the second time', async () => {
      const { orderId } = await seedPaidOrder();
      await extra.processOrderFulfillmentAutomation(orderId);
      await extra.processOrderFulfillmentAutomation(orderId); // must not throw "invalid transition"
      const order = await m.OrderModel.findById(orderId).lean();
      assert.equal(order!.status, 'packed');
    });

    test('resumes correctly from a mid-pipeline crash (order left sitting at CONFIRMED)', async () => {
      const { orderId } = await seedPaidOrder();
      // Simulate a crash after step 1 by advancing to CONFIRMED directly,
      // bypassing the automation function itself.
      const order = await m.OrderModel.findById(orderId);
      order!.status = 'confirmed';
      order!.statusHistory.push({ status: 'confirmed', changedBy: null, note: 'simulated crash recovery point' });
      await order!.save();

      await extra.processOrderFulfillmentAutomation(orderId);
      const after = await m.OrderModel.findById(orderId).lean();
      assert.equal(after!.status, 'packed', 'must finish the remaining step, not restart or error');
    });
  });

  // ---------------------------------------------------------------------
  // Part 2/3/25/29 — the sweep: due/not-due pacing, distributed lock,
  // batched discovery, config enforcement.
  // ---------------------------------------------------------------------
  describe('runFulfillmentAutomationSweepJob', () => {
    test('discovers and enqueues eligible orders, skips ineligible ones', async () => {
      const { orderId: eligibleOrderId } = await seedPaidOrder();
      const { orderId: toCancelOrderId } = await seedPaidOrder();
      await m.OrderModel.updateOne({ _id: toCancelOrderId }, { status: 'cancelled' });

      const enqueued = await extra.runFulfillmentAutomationSweepJob();
      assert.equal(enqueued, 1);

      const waiting = await extra.orderFulfillmentAutomationQueue.getJobs(['waiting', 'active', 'completed']);
      const enqueuedOrderIds = waiting.map((j) => j.data.orderId);
      assert.ok(enqueuedOrderIds.includes(eligibleOrderId));
      assert.ok(!enqueuedOrderIds.includes(toCancelOrderId));
    });

    test('a second sweep run immediately after the first is a safe no-op (distributed lock / not due yet)', async () => {
      await seedPaidOrder();
      const first = await extra.runFulfillmentAutomationSweepJob();
      const second = await extra.runFulfillmentAutomationSweepJob();
      assert.equal(first, 1);
      assert.equal(second, 0, 'the sweep window has not elapsed again yet — must not re-discover/re-enqueue');
    });

    test('two concurrent sweep calls never both claim the same window (Part 29)', async () => {
      await seedPaidOrder();
      const [a, b] = await Promise.all([
        extra.runFulfillmentAutomationSweepJob(),
        extra.runFulfillmentAutomationSweepJob(),
      ]);
      const total = a + b;
      assert.equal(total, 1, 'exactly one of the two concurrent calls may claim and enqueue — never both, never neither');
    });

    test('automationEnabled: false stops the sweep from enqueueing anything (Part 30/31 — backend-enforced, not just hidden UI)', async () => {
      await extra.setFulfillmentConfig({ automationEnabled: false }, systemActorId);
      await seedPaidOrder();
      const enqueued = await extra.runFulfillmentAutomationSweepJob();
      assert.equal(enqueued, 0);
    });
  });

  // ---------------------------------------------------------------------
  // Part 19/37 — S3 retention sweep (S3 transport stubbed, see file header)
  // ---------------------------------------------------------------------
  describe('runDocumentRetentionSweepJob', () => {
    test('expires an AVAILABLE S3 invoice document past retention, deletes the S3 object, preserves the DB record', async (t) => {
      t.mock.method(extra.s3Ops, 'isS3Configured', async () => true);
      t.mock.method(extra.s3Ops, 'getDocumentRetentionDays', async () => 30);
      const deleteCalls: string[] = [];
      t.mock.method(extra.s3Ops, 'deleteObject', async (key: string) => {
        deleteCalls.push(key);
      });

      const { orderId } = await seedPaidOrder();
      const oldUploadedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago > 30-day retention
      const invoice = await extra.InvoiceModel.create({
        invoiceNumber: `INV-TEST-${Date.now()}`,
        orderId,
        customerId: (await m.OrderModel.findById(orderId).lean())!.customerId,
        invoiceDate: oldUploadedAt,
        totals: { subtotal: 100, gst: 12, shipping: 0, discount: 0, grandTotal: 112 },
        status: 'generated',
        pdfUrl: `invoices/unassigned/2020/01/INV-TEST.pdf`,
        storageProvider: 's3',
        documentStatus: 'available',
      });
      await extra.DocumentModel.create({
        entityType: 'invoice',
        entityId: orderId,
        sellerId: null,
        documentType: 'invoice',
        storageProvider: 's3',
        bucket: 'test-bucket',
        objectKey: invoice.pdfUrl,
        fileName: 'INV-TEST.pdf',
        mimeType: 'application/pdf',
        fileSize: 1234,
        status: 'available',
        uploadedAt: oldUploadedAt,
      });

      const expiredCount = await extra.runDocumentRetentionSweepJob();
      assert.equal(expiredCount, 1);
      assert.deepEqual(deleteCalls, [invoice.pdfUrl]);

      const doc = await extra.DocumentModel.findOne({ entityType: 'invoice', entityId: orderId }).lean();
      assert.equal(doc!.status, 'expired', 'DB record must survive — only the status flips');
      const refreshedInvoice = await extra.InvoiceModel.findById(invoice._id).lean();
      assert.equal(refreshedInvoice!.documentStatus, 'expired');
      assert.equal(refreshedInvoice!.pdfUrl, invoice.pdfUrl, 'the S3 key reference itself is untouched — still points at the (now-deleted) object for audit purposes');
    });

    test('a document within the retention window is left untouched', async (t) => {
      t.mock.method(extra.s3Ops, 'isS3Configured', async () => true);
      t.mock.method(extra.s3Ops, 'getDocumentRetentionDays', async () => 30);
      const deleteCalls: string[] = [];
      t.mock.method(extra.s3Ops, 'deleteObject', async (key: string) => {
        deleteCalls.push(key);
      });

      const { orderId } = await seedPaidOrder();
      await extra.DocumentModel.create({
        entityType: 'invoice',
        entityId: orderId,
        sellerId: null,
        documentType: 'invoice',
        storageProvider: 's3',
        bucket: 'test-bucket',
        objectKey: 'invoices/unassigned/2026/01/recent.pdf',
        fileName: 'recent.pdf',
        mimeType: 'application/pdf',
        fileSize: 1234,
        status: 'available',
        uploadedAt: new Date(), // uploaded just now
      });

      const expiredCount = await extra.runDocumentRetentionSweepJob();
      assert.equal(expiredCount, 0);
      assert.deepEqual(deleteCalls, []);
    });

    test('a failed S3 delete leaves the document AVAILABLE for the next run (Part 37)', async (t) => {
      t.mock.method(extra.s3Ops, 'isS3Configured', async () => true);
      t.mock.method(extra.s3Ops, 'getDocumentRetentionDays', async () => 30);
      t.mock.method(extra.s3Ops, 'deleteObject', async () => {
        throw new Error('simulated transient S3 failure');
      });

      const { orderId } = await seedPaidOrder();
      const oldUploadedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      await extra.DocumentModel.create({
        entityType: 'invoice',
        entityId: orderId,
        sellerId: null,
        documentType: 'invoice',
        storageProvider: 's3',
        bucket: 'test-bucket',
        objectKey: 'invoices/unassigned/2020/01/fails.pdf',
        fileName: 'fails.pdf',
        mimeType: 'application/pdf',
        fileSize: 1234,
        status: 'available',
        uploadedAt: oldUploadedAt,
      });

      const expiredCount = await extra.runDocumentRetentionSweepJob();
      assert.equal(expiredCount, 0, 'a failed delete must not count as expired');
      const doc = await extra.DocumentModel.findOne({ entityType: 'invoice', entityId: orderId }).lean();
      assert.equal(doc!.status, 'available', 'must remain AVAILABLE, not silently marked expired, and not deleted from the DB');
    });
  });

  // ---------------------------------------------------------------------
  // Part 12/38 — transparent regeneration from the frozen snapshot
  // ---------------------------------------------------------------------
  describe('invoice download regenerates a PDF whose S3 object is gone, from immutable data', () => {
    test('an EXPIRED invoice is regenerated on download without recomputing tax/price', async (t) => {
      const { orderId, customer } = await seedPaidOrder();
      const order = await m.OrderModel.findById(orderId).lean();

      const invoice = await extra.InvoiceModel.create({
        invoiceNumber: `INV-REGEN-${Date.now()}`,
        orderId,
        customerId: customer._id,
        invoiceDate: new Date(),
        totals: order!.totals,
        items: order!.items.map((item: { name: string; sku: string; quantity: number; unitPrice: number; gstRate: number; amount: number }) => ({
          name: item.name,
          hsnCode: '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          gstRate: item.gstRate,
          amount: item.amount,
          taxableAmount: item.amount,
        })),
        gstBreakup: { cgst: order!.totals!.gst / 2, sgst: order!.totals!.gst / 2, igst: 0 },
        taxType: 'intra_state',
        finalAmount: order!.totals!.grandTotal,
        status: 'generated',
        pdfUrl: 'invoices/unassigned/2020/01/expired-invoice.pdf',
        storageProvider: 's3',
        documentStatus: 'expired', // already marked expired by a prior retention sweep
      });

      // `uploadAndRecordDocument` (document-storage.helper.ts) gates on the
      // REAL `isS3Configured()` (not mocked here — only the actual network
      // calls behind it are, via s3Ops), so it needs real-looking (if
      // fake) credentials in the `s3` Configuration namespace to take the
      // S3 branch at all rather than silently falling back to Cloudinary.
      await extra.ConfigurationModel.create({
        namespace: 's3',
        value: { region: 'us-east-1', accessKeyId: 'fake', secretAccessKey: 'fake', bucket: 'test-bucket' },
      });

      t.mock.method(extra.s3Ops, 'objectExists', async () => false);
      let uploadedBuffer: Buffer | null = null;
      t.mock.method(extra.s3Ops, 'uploadDocument', async (input: { buffer: Buffer; objectKey: string }) => {
        uploadedBuffer = input.buffer;
        return { bucket: 'test-bucket', objectKey: input.objectKey, fileSize: input.buffer.byteLength };
      });
      t.mock.method(extra.s3Ops, 'getPresignedDownloadUrl', async (key: string) => `https://signed.example/${key}`);

      const before = {
        totalsGst: invoice.totals!.gst,
        finalAmount: invoice.finalAmount,
        itemUnitPrice: invoice.items[0]?.unitPrice,
      };

      const result = await extra.getInvoiceDownloadUrl(orderId, String(customer._id));
      assert.ok(result.url.startsWith('https://signed.example/'));
      assert.ok(uploadedBuffer, 'a new PDF must actually have been rendered and uploaded');

      const refreshed = await extra.InvoiceModel.findById(invoice._id).lean();
      assert.equal(refreshed!.documentStatus, 'available', 'flips back to available after successful regeneration');
      assert.equal(refreshed!.regenerations.length, 1, 'exactly one regeneration recorded');
      assert.equal(refreshed!.regenerations[0].generatedBy, null, 'system-triggered, not attributed to a human admin');

      // Part 8/38 — the FROZEN snapshot values must be completely unchanged
      // by regeneration; only the PDF file/S3 key/status change, never the
      // tax/price data itself.
      assert.equal(refreshed!.totals!.gst, before.totalsGst);
      assert.equal(refreshed!.finalAmount, before.finalAmount);
      assert.equal(refreshed!.items[0]?.unitPrice, before.itemUnitPrice);
    });

    test('a still-present S3 object is served as-is, with no regeneration attempted', async (t) => {
      const { orderId, customer } = await seedPaidOrder();
      const order = await m.OrderModel.findById(orderId).lean();

      const invoice = await extra.InvoiceModel.create({
        invoiceNumber: `INV-PRESENT-${Date.now()}`,
        orderId,
        customerId: customer._id,
        invoiceDate: new Date(),
        totals: order!.totals,
        finalAmount: order!.totals!.grandTotal,
        status: 'generated',
        pdfUrl: 'invoices/unassigned/2026/01/still-here.pdf',
        storageProvider: 's3',
        documentStatus: 'available',
      });

      t.mock.method(extra.s3Ops, 'objectExists', async () => true);
      let uploadCalled = false;
      t.mock.method(extra.s3Ops, 'uploadDocument', async () => {
        uploadCalled = true;
        return { bucket: 'x', objectKey: 'x', fileSize: 0 };
      });
      t.mock.method(extra.s3Ops, 'getPresignedDownloadUrl', async (key: string) => `https://signed.example/${key}`);

      const result = await extra.getInvoiceDownloadUrl(orderId, String(customer._id));
      assert.equal(result.url, `https://signed.example/${invoice.pdfUrl}`);
      assert.equal(uploadCalled, false, 'must never regenerate when the object is still present');
    });
  });
});
