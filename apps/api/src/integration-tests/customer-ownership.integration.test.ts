import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Real HTTP-level IDOR regression tests — boots the actual Express app
 * (createApp()) against a real, ephemeral MongoDB + Redis and drives every
 * request through supertest, exactly the way a real client would. This is
 * the automated replacement for  21's one-off verify-21.ts
 * script: two seeded customers, Customer A repeatedly attempting to read/
 * mutate Customer B's order/address/invoice/prescription/shipment/return via
 * the real routes, asserting the ownership boundary holds (403/404) rather
 * than leaking or mutating another customer's data.
 */
describe('Customer ownership boundaries (IDOR)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  async function seedTwoCustomers() {
    const [customerA, customerB] = await Promise.all([
      createCustomer(m.UserModel, { name: 'Customer A' }),
      createCustomer(m.UserModel, { name: 'Customer B' }),
    ]);
    return {
      customerA,
      customerB,
      tokenA: bearerFor(m.signAccessToken, customerA),
      tokenB: bearerFor(m.signAccessToken, customerB),
    };
  }

  function shippingAddress() {
    return {
      name: 'Test Recipient',
      line1: '221B Baker Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9876543210',
    };
  }

  async function seedOrderFor(customerId: unknown, overrides: Record<string, unknown> = {}) {
    return m.OrderModel.create({
      orderNumber: `ORD-${new m.mongoose.Types.ObjectId().toString()}`,
      customerId,
      items: [
        {
          productId: new m.mongoose.Types.ObjectId(),
          name: 'Paracetamol 500mg',
          sku: 'SKU-PARA-500',
          quantity: 1,
          unitPrice: 100,
          gstRate: 5,
          amount: 100,
        },
      ],
      shippingAddress: shippingAddress(),
      status: 'placed',
      totals: { subtotal: 100, gst: 5, grandTotal: 105 },
      ...overrides,
    });
  }

  test('GET /orders/:id — customer A cannot read customer B\'s order', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);

    const res = await request(ctx.app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('GET /orders/:id — owner can read their own order', async () => {
    const { customerA, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerA._id);

    const res = await request(ctx.app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.orderNumber, order.orderNumber);
  });

  test('POST /orders/:id/cancel — customer A cannot cancel customer B\'s order', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id, { status: 'placed' });

    const res = await request(ctx.app)
      .post(`/api/v1/orders/${order._id}/cancel`)
      .set('Authorization', tokenA)
      .send({ reason: 'Changed my mind' });

    assert.equal(
      res.status,
      403,
      `expected cancelling another customer's order to be forbidden, got ${res.status}: ${JSON.stringify(res.body)}`,
    );

    const reloaded = await m.OrderModel.findById(order._id).lean();
    assert.equal(reloaded?.status, 'placed', "order B's status must be unchanged by A's cancel attempt");
  });

  test('PATCH /addresses/:id — customer A cannot update customer B\'s address', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const address = await m.CustomerAddressModel.create({
      userId: customerB._id,
      line1: 'Original line 1',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      phone: '9876500000',
    });

    const res = await request(ctx.app)
      .patch(`/api/v1/addresses/${address._id}`)
      .set('Authorization', tokenA)
      .send({ line1: 'Hijacked line 1' });

    assert.equal(res.status, 404);

    const reloaded = await m.CustomerAddressModel.findById(address._id).lean();
    assert.equal(reloaded?.line1, 'Original line 1');
  });

  test('DELETE /addresses/:id — customer A cannot delete customer B\'s address', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const address = await m.CustomerAddressModel.create({
      userId: customerB._id,
      line1: 'Line 1',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      phone: '9876500000',
    });

    const res = await request(ctx.app)
      .delete(`/api/v1/addresses/${address._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 404);

    // auditPlugin adds `deletedAt` to the schema at runtime (see plugins/audit.plugin.ts);
    // InferSchemaType only sees the statically-declared fields, hence the cast.
    const reloaded = (await m.CustomerAddressModel.findById(address._id).lean()) as { deletedAt: Date | null } | null;
    assert.equal(reloaded?.deletedAt, null);
  });

  test('PATCH /addresses/:id/default — customer A cannot make customer B\'s address default', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const address = await m.CustomerAddressModel.create({
      userId: customerB._id,
      line1: 'Line 1',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      phone: '9876500000',
      isDefault: false,
    });

    const res = await request(ctx.app)
      .patch(`/api/v1/addresses/${address._id}/default`)
      .set('Authorization', tokenA)
      .send({ isDefault: true });

    assert.equal(res.status, 404);

    const reloaded = await m.CustomerAddressModel.findById(address._id).lean();
    assert.equal(reloaded?.isDefault, false);
  });

  test('GET /invoices/order/:orderId — customer A cannot read customer B\'s invoice', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);
    await m.InvoiceModel.create({
      invoiceNumber: `INV-${new m.mongoose.Types.ObjectId().toString()}`,
      orderId: order._id,
      customerId: customerB._id,
      totals: { subtotal: 100, gst: 5, grandTotal: 105 },
      pdfUrl: 'invoices/test.pdf',
    });

    const res = await request(ctx.app)
      .get(`/api/v1/invoices/order/${order._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 404);
  });

  test('GET /invoices/order/:orderId/download-url — customer A cannot get a download link for customer B\'s invoice', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);
    await m.InvoiceModel.create({
      invoiceNumber: `INV-${new m.mongoose.Types.ObjectId().toString()}`,
      orderId: order._id,
      customerId: customerB._id,
      totals: { subtotal: 100, gst: 5, grandTotal: 105 },
      pdfUrl: 'invoices/test.pdf',
    });

    const res = await request(ctx.app)
      .get(`/api/v1/invoices/order/${order._id}/download-url`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 404);
  });

  test('POST /invoices/:orderId/email — customer A cannot trigger an email of customer B\'s invoice', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);
    await m.InvoiceModel.create({
      invoiceNumber: `INV-${new m.mongoose.Types.ObjectId().toString()}`,
      orderId: order._id,
      customerId: customerB._id,
      totals: { subtotal: 100, gst: 5, grandTotal: 105 },
      pdfUrl: 'invoices/test.pdf',
    });

    const res = await request(ctx.app)
      .post(`/api/v1/invoices/${order._id}/email`)
      .set('Authorization', tokenA)
      .send({});

    assert.equal(res.status, 404);
  });

  test('GET /prescriptions/:id — customer A cannot view customer B\'s prescription', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const prescription = await m.PrescriptionUploadModel.create({
      userId: customerB._id,
      cloudinaryPublicId: 'test-public-id',
      status: 'pending',
    });

    const res = await request(ctx.app)
      .get(`/api/v1/prescriptions/${prescription._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 403);
  });

  test('POST /prescriptions/:id/cancel — customer A cannot cancel customer B\'s prescription', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const prescription = await m.PrescriptionUploadModel.create({
      userId: customerB._id,
      cloudinaryPublicId: 'test-public-id',
      status: 'pending',
    });

    const res = await request(ctx.app)
      .post(`/api/v1/prescriptions/${prescription._id}/cancel`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 404);

    const reloaded = await m.PrescriptionUploadModel.findById(prescription._id).lean();
    assert.equal(reloaded?.status, 'pending');
  });

  test('GET /shipments/order/:orderId — customer A cannot view shipments for customer B\'s order', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);
    await m.ShipmentModel.create({ orderId: order._id, status: 'pending' });

    const res = await request(ctx.app)
      .get(`/api/v1/shipments/order/${order._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 403);
  });

  test('GET /returns/:id — customer A cannot view customer B\'s return request', async () => {
    const { customerB, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id, { status: 'delivered' });
    const ret = await m.ReturnModel.create({
      orderId: order._id,
      customerId: customerB._id,
      items: [{ orderItemId: new m.mongoose.Types.ObjectId(), quantity: 1, reason: 'Damaged item' }],
      status: 'requested',
    });

    const res = await request(ctx.app)
      .get(`/api/v1/returns/${ret._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 403);
  });

  test('GET /returns/:id — owner can view their own return request', async () => {
    const { customerA, tokenA } = await seedTwoCustomers();
    const order = await seedOrderFor(customerA._id, { status: 'delivered' });
    const ret = await m.ReturnModel.create({
      orderId: order._id,
      customerId: customerA._id,
      items: [{ orderItemId: new m.mongoose.Types.ObjectId(), quantity: 1, reason: 'Damaged item' }],
      status: 'requested',
    });

    const res = await request(ctx.app)
      .get(`/api/v1/returns/${ret._id}`)
      .set('Authorization', tokenA);

    assert.equal(res.status, 200);
  });

  test('unauthenticated request is rejected before any ownership check', async () => {
    const { customerB } = await seedTwoCustomers();
    const order = await seedOrderFor(customerB._id);

    const res = await request(ctx.app).get(`/api/v1/orders/${order._id}`);

    assert.equal(res.status, 401);
  });

  describe('Address default-address atomicity under real concurrency', () => {
    test('two concurrent "set as default" requests never leave two (or zero) default addresses', async () => {
      const { customerA, tokenA } = await seedTwoCustomers();
      const [addressOne, addressTwo] = await Promise.all([
        m.CustomerAddressModel.create({
          userId: customerA._id,
          line1: 'Address One',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
          phone: '9000000001',
          isDefault: true,
        }),
        m.CustomerAddressModel.create({
          userId: customerA._id,
          line1: 'Address Two',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411002',
          phone: '9000000002',
          isDefault: false,
        }),
      ]);

      // Fire both "make me default" requests concurrently — this is exactly
      // the race address.service.ts's Part 7/60 transaction fix
      // (clearDefaultInSession + findOneAndUpdate in one session.withTransaction)
      // exists to close: two non-transactional writes interleaving could
      // previously leave either zero or two addresses marked default.
      const [resOne, resTwo] = await Promise.all([
        request(ctx.app)
          .patch(`/api/v1/addresses/${addressOne._id}/default`)
          .set('Authorization', tokenA)
          .send({ isDefault: true }),
        request(ctx.app)
          .patch(`/api/v1/addresses/${addressTwo._id}/default`)
          .set('Authorization', tokenA)
          .send({ isDefault: true }),
      ]);

      assert.equal(resOne.status, 200);
      assert.equal(resTwo.status, 200);

      const addresses = await m.CustomerAddressModel.find({ userId: customerA._id }).lean();
      const defaults = addresses.filter((a) => a.isDefault === true);
      assert.equal(
        defaults.length,
        1,
        `expected exactly one default address after the race, found ${defaults.length}: ${JSON.stringify(addresses)}`,
      );
    });
  });
});
