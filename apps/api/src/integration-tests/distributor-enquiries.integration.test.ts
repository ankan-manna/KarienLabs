import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { bearerFor, createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 32 — real HTTP-level tests (same pattern as Prompt 6/31's
 * registration-address-verification suite) against the actual Express app +
 * a real, ephemeral MongoDB + Redis. Covers: guest/authenticated enquiry
 * creation, product-snapshot immutability, the three hard isolation
 * guarantees (no inventory/payment/shipping/invoice side effects — Part
 * 15-19), malicious-input rejection, admin RBAC, internal-note privacy, and
 * config-driven enable/disable + OTP gating.
 */
describe('Prompt 32 — Distributor/Bulk Purchase enquiries', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    RoleModel: typeof import('../modules/auth/models/role.model').RoleModel;
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    WarehouseModel: typeof import('../modules/inventory/models/warehouse.model').WarehouseModel;
    BatchModel: typeof import('../modules/inventory/models/batch.model').BatchModel;
    DistributorEnquiryModel: typeof import('../modules/distributor-enquiries/models/distributor-enquiry.model').DistributorEnquiryModel;
    setConfiguration: typeof import('../modules/platform/configuration.service').setConfiguration;
  };

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    const [
      { RoleModel },
      { CategoryModel },
      { ProductModel },
      { WarehouseModel },
      { BatchModel },
      { DistributorEnquiryModel },
      configurationService,
    ] = await Promise.all([
      import('../modules/auth/models/role.model'),
      import('../modules/catalog/models/category.model'),
      import('../modules/catalog/models/product.model'),
      import('../modules/inventory/models/warehouse.model'),
      import('../modules/inventory/models/batch.model'),
      import('../modules/distributor-enquiries/models/distributor-enquiry.model'),
      import('../modules/platform/configuration.service'),
    ]);
    extra = {
      RoleModel,
      CategoryModel,
      ProductModel,
      WarehouseModel,
      BatchModel,
      DistributorEnquiryModel,
      setConfiguration: configurationService.setConfiguration,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  async function seedProduct(overrides: Record<string, unknown> = {}) {
    const category = await extra.CategoryModel.create({
      name: 'Test Category',
      slug: `cat-${Date.now()}-${Math.random()}`,
    });
    return extra.ProductModel.create({
      name: 'Paracetamol 500mg',
      slug: `p-${Date.now()}-${Math.random()}`,
      sku: `SKU-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      categoryId: category._id,
      basePrice: 100,
      mrp: 120,
      gstRate: 12,
      isActive: true,
      ...overrides,
    });
  }

  async function seedBatch(productId: unknown, quantityAvailable: number) {
    const warehouse = await extra.WarehouseModel.create({
      name: 'WH1',
      code: `WH-${Date.now()}-${Math.random()}`,
    });
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

  function validEnquiryBody(overrides: Record<string, unknown> = {}) {
    return {
      companyName: 'Acme Distributors',
      contactPerson: 'Jane Doe',
      email: `distributor-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      mobile: '9876543210',
      businessAddress: '221B Baker Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      ...overrides,
    };
  }

  async function seedAdminWithPermission(actions: string[]) {
    await extra.RoleModel.create({
      key: 'admin',
      name: 'Platform Admin',
      permissions: actions.map((a) => `distributor_enquiries:${a}`),
      isSystem: true,
    });
    const admin = await createCustomer(m.UserModel, { name: 'Ops Admin', role: 'admin' });
    return { admin, token: bearerFor(m.signAccessToken, admin) };
  }

  test('guest can submit an enquiry (no account, no auth header)', async () => {
    const res = await request(ctx.app).post('/api/v1/distributor-enquiries').send(validEnquiryBody());

    assert.equal(res.status, 201);
    assert.ok(res.body.data.enquiryNumber);
    assert.equal(res.body.data.status, 'new');

    const stored = await extra.DistributorEnquiryModel.findOne({ enquiryNumber: res.body.data.enquiryNumber });
    assert.equal(stored?.userId, null);
  });

  test('an authenticated customer\'s enquiry is associated via the session, never a body field', async () => {
    const customer = await createCustomer(m.UserModel);
    const token = bearerFor(m.signAccessToken, customer);

    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .set('Authorization', token)
      .send(validEnquiryBody());

    assert.equal(res.status, 201);
    const stored = await extra.DistributorEnquiryModel.findOne({ enquiryNumber: res.body.data.enquiryNumber });
    assert.equal(String(stored?.userId), String(customer._id));
  });

  test('product snapshot survives a later product rename/deactivation', async () => {
    const product = await seedProduct({ name: 'Original Name', sku: 'ORIG-SKU-1' });
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ requestedProducts: [{ productId: String(product._id), requestedQuantity: 500 }] }));
    assert.equal(res.status, 201);

    await extra.ProductModel.updateOne(
      { _id: product._id },
      { name: 'Renamed Product', sku: 'NEW-SKU-2', isActive: false },
    );

    const stored = await extra.DistributorEnquiryModel.findOne({ enquiryNumber: res.body.data.enquiryNumber }).lean();
    assert.equal(stored?.requestedProducts[0].nameSnapshot, 'Original Name');
    assert.equal(stored?.requestedProducts[0].skuSnapshot, 'ORIG-SKU-1');
    assert.equal(stored?.requestedProducts[0].requestedQuantity, 500);
  });

  test('an inactive/nonexistent product reference rejects the whole submission', async () => {
    const product = await seedProduct({ isActive: false });
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ requestedProducts: [{ productId: String(product._id), requestedQuantity: 10 }] }));
    assert.equal(res.status, 404);

    const count = await extra.DistributorEnquiryModel.countDocuments({});
    assert.equal(count, 0);
  });

  test('inventory is never touched by an enquiry (Part 15/16/66)', async () => {
    const product = await seedProduct();
    const batch = await seedBatch(product._id, 200);

    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ requestedProducts: [{ productId: String(product._id), requestedQuantity: 150 }] }));
    assert.equal(res.status, 201);

    const refreshedBatch = await extra.BatchModel.findById(batch._id).lean();
    assert.equal(refreshedBatch?.quantityAvailable, 200);
  });

  test('no Order, Payment, or Shipment is ever created by an enquiry (Part 15/17-19/67/68)', async () => {
    const product = await seedProduct();
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ requestedProducts: [{ productId: String(product._id), requestedQuantity: 10 }] }));
    assert.equal(res.status, 201);

    assert.equal(await m.OrderModel.countDocuments({}), 0);
    assert.equal(await m.PaymentModel.countDocuments({}), 0);
    assert.equal(await m.ShipmentModel.countDocuments({}), 0);
    assert.equal(await m.InvoiceModel.countDocuments({}), 0);
  });

  test('a NoSQL-operator-shaped email is rejected, not executed as a query', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ email: { $gt: '' } }));
    assert.equal(res.status, 400);
  });

  test('zero/negative requested quantity is rejected', async () => {
    const product = await seedProduct();
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ requestedProducts: [{ productId: String(product._id), requestedQuantity: -5 }] }));
    assert.equal(res.status, 400);
  });

  test('an invalid GSTIN format is rejected', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ gstin: 'not-a-real-gstin' }));
    assert.equal(res.status, 400);
  });

  test('disabling the feature rejects new submissions', async () => {
    await extra.setConfiguration('distributor_enquiry', { enquiryEnabled: false }, String(new m.mongoose.Types.ObjectId()));
    const res = await request(ctx.app).post('/api/v1/distributor-enquiries').send(validEnquiryBody());
    assert.equal(res.status, 422);
    assert.equal(await extra.DistributorEnquiryModel.countDocuments({}), 0);
  });

  test('OTP-required config: submission without a verified token is rejected; the full request->verify->submit flow succeeds', async () => {
    await extra.setConfiguration('distributor_enquiry', { otpRequired: true }, String(new m.mongoose.Types.ObjectId()));
    const email = `otp-dist-${Date.now()}@example.test`;

    const withoutToken = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ email }));
    assert.equal(withoutToken.status, 422);

    const otpReq = await request(ctx.app).post('/api/v1/distributor-enquiries/otp/request').send({ email });
    assert.equal(otpReq.status, 200);
    assert.ok(otpReq.body.data.devOnlyCode);

    const otpVerify = await request(ctx.app)
      .post('/api/v1/distributor-enquiries/otp/verify')
      .send({ email, code: otpReq.body.data.devOnlyCode });
    assert.equal(otpVerify.status, 200);
    const { contactVerificationToken } = otpVerify.body.data;
    assert.ok(contactVerificationToken);

    const withToken = await request(ctx.app)
      .post('/api/v1/distributor-enquiries')
      .send(validEnquiryBody({ email, contactVerificationToken }));
    assert.equal(withToken.status, 201);
  });

  describe('Admin RBAC', () => {
    test('unauthenticated request cannot list enquiries', async () => {
      const res = await request(ctx.app).get('/api/v1/admin/distributor-enquiries');
      assert.equal(res.status, 401);
    });

    test('a plain customer cannot list enquiries', async () => {
      const customer = await createCustomer(m.UserModel);
      const res = await request(ctx.app)
        .get('/api/v1/admin/distributor-enquiries')
        .set('Authorization', bearerFor(m.signAccessToken, customer));
      assert.equal(res.status, 403);
    });

    test('an admin without distributor_enquiries:read cannot list enquiries', async () => {
      await extra.RoleModel.create({ key: 'admin', name: 'Platform Admin', permissions: [], isSystem: true });
      const admin = await createCustomer(m.UserModel, { role: 'admin' });
      const res = await request(ctx.app)
        .get('/api/v1/admin/distributor-enquiries')
        .set('Authorization', bearerFor(m.signAccessToken, admin));
      assert.equal(res.status, 403);
    });

    test('an admin WITH distributor_enquiries:read can list enquiries', async () => {
      const { token } = await seedAdminWithPermission(['read']);
      await request(ctx.app).post('/api/v1/distributor-enquiries').send(validEnquiryBody());

      const res = await request(ctx.app).get('/api/v1/admin/distributor-enquiries').set('Authorization', token);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
    });

    test('internal notes are NEVER returned by the customer\'s own "my enquiries" read', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = bearerFor(m.signAccessToken, customer);
      await request(ctx.app)
        .post('/api/v1/distributor-enquiries')
        .set('Authorization', token)
        .send(validEnquiryBody());

      const { token: adminToken } = await seedAdminWithPermission(['read', 'update']);
      const mine = await request(ctx.app).get('/api/v1/distributor-enquiries/me').set('Authorization', token);
      const enquiryId = mine.body.data[0]._id;

      await request(ctx.app)
        .post(`/api/v1/admin/distributor-enquiries/${enquiryId}/notes`)
        .set('Authorization', adminToken)
        .send({ note: 'Called distributor, they need 2000 units next month.' });

      const myEnquiriesAfter = await request(ctx.app)
        .get('/api/v1/distributor-enquiries/me')
        .set('Authorization', token);
      assert.equal(myEnquiriesAfter.status, 200);
      assert.equal(myEnquiriesAfter.body.data[0].internalNotes, undefined);
    });

    test('valid status transition succeeds; invalid transition is rejected', async () => {
      const { token } = await seedAdminWithPermission(['read', 'update']);
      const created = await request(ctx.app).post('/api/v1/distributor-enquiries').send(validEnquiryBody());
      const id = (await extra.DistributorEnquiryModel.findOne({ enquiryNumber: created.body.data.enquiryNumber }))!
        ._id;

      const goodTransition = await request(ctx.app)
        .patch(`/api/v1/admin/distributor-enquiries/${id}/status`)
        .set('Authorization', token)
        .send({ status: 'in_review' });
      assert.equal(goodTransition.status, 200);
      assert.equal(goodTransition.body.data.status, 'in_review');

      // in_review -> converted is not a legal direct transition (must go
      // through contacted/negotiating/quoted first).
      const badTransition = await request(ctx.app)
        .patch(`/api/v1/admin/distributor-enquiries/${id}/status`)
        .set('Authorization', token)
        .send({ status: 'converted' });
      assert.equal(badTransition.status, 422);
    });
  });
});
