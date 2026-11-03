import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Real HTTP-level regression tests for the guest-cart fix — boots the
 * actual Express app against a real, ephemeral MongoDB + Redis (same
 * pattern as customer-ownership.integration.test.ts).
 *
 * The bug this guards against: an anonymous visitor calling any `/cart`
 * route previously got `401 "Missing bearer token"` (`cartRouter` was
 * blanket-gated by `requireAuth`). These tests exercise the fix end-to-end
 * — guest add/update/remove/persist, cross-guest isolation, a
 * tampered-cookie edge case, the guest-to-account merge on login (including
 * quantity summation and server-side re-pricing), and confirm the routes
 * that must STAY authenticated (orders, cart coupons) still are.
 */
describe('Guest cart (anonymous shopping + login merge)', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    CategoryModel: typeof import('../modules/catalog/models/category.model').CategoryModel;
    ProductModel: typeof import('../modules/catalog/models/product.model').ProductModel;
    CartModel: typeof import('../modules/customers/models/cart.model').CartModel;
  };

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    const [{ CategoryModel }, { ProductModel }, { CartModel }] = await Promise.all([
      import('../modules/catalog/models/category.model'),
      import('../modules/catalog/models/product.model'),
      import('../modules/customers/models/cart.model'),
    ]);
    extra = { CategoryModel, ProductModel, CartModel };
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
      name: 'Test Product',
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

  function guestCookieFrom(res: request.Response): string | undefined {
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    return cookies.find((c: string) => c.startsWith('mc_guest_cart='));
  }

  test('GET /cart as a genuinely anonymous visitor returns 200, not "Missing bearer token"', async () => {
    const res = await request(ctx.app).get('/api/v1/cart');

    assert.equal(res.status, 200);
    assert.equal(res.body.error, null);
    assert.deepEqual(res.body.data.items, []);
    assert.ok(guestCookieFrom(res), 'expected a guest-cart cookie to be issued');
  });

  test('guest can add, see persisted, update, and remove a cart item across requests', async () => {
    const product = await seedProduct();
    const agent = request.agent(ctx.app);

    const addRes = await agent
      .post('/api/v1/cart/items')
      .send({ productId: String(product._id), quantity: 2 });
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.data.items.length, 1);
    assert.equal(addRes.body.data.items[0].quantity, 2);

    // Persistence: a second request on the SAME agent (same cookie jar) sees the same cart.
    const getRes = await agent.get('/api/v1/cart');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.items.length, 1);
    assert.equal(getRes.body.data.items[0].quantity, 2);

    const updateRes = await agent
      .patch(`/api/v1/cart/items/${product._id}`)
      .send({ quantity: 5 });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.items[0].quantity, 5);

    const removeRes = await agent.delete(`/api/v1/cart/items/${product._id}`);
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.body.data.items.length, 0);
  });

  test('two anonymous visitors (no shared cookie) get fully isolated carts', async () => {
    const productA = await seedProduct({ name: 'Product A' });
    const productB = await seedProduct({ name: 'Product B' });
    const agentA = request.agent(ctx.app);
    const agentB = request.agent(ctx.app);

    await agentA.post('/api/v1/cart/items').send({ productId: String(productA._id), quantity: 1 });
    await agentB.post('/api/v1/cart/items').send({ productId: String(productB._id), quantity: 1 });

    const cartA = await agentA.get('/api/v1/cart');
    const cartB = await agentB.get('/api/v1/cart');

    assert.equal(cartA.body.data.items.length, 1);
    assert.equal(cartA.body.data.items[0].productId, String(productA._id));
    assert.equal(cartB.body.data.items.length, 1);
    assert.equal(cartB.body.data.items[0].productId, String(productB._id));
  });

  test('a malformed/tampered guest-cart cookie is never used as a lookup key — a fresh one is issued instead', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/cart')
      .set('Cookie', 'mc_guest_cart=not-a-real-session-id;');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.items, []);
    const issued = guestCookieFrom(res);
    assert.ok(issued, 'expected a replacement cookie to be issued for the malformed value');
    assert.ok(!issued!.includes('not-a-real-session-id'));
  });

  test('cart coupon routes stay requireAuth-gated — a guest cannot apply or remove a coupon', async () => {
    const applyRes = await request(ctx.app).post('/api/v1/cart/coupon').send({ code: 'TEST10' });
    assert.equal(applyRes.status, 401);
    assert.equal(applyRes.body.error.message, 'Missing bearer token');

    const removeRes = await request(ctx.app).delete('/api/v1/cart/coupon');
    assert.equal(removeRes.status, 401);
  });

  test('order routes are unaffected — still reject an anonymous visitor exactly as before', async () => {
    const res = await request(ctx.app).get('/api/v1/orders');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Missing bearer token');
  });

  test('guest cart merges into the account cart on login: quantities sum, price is re-fetched server-side, guest cart doc is deleted', async () => {
    const product = await seedProduct({ basePrice: 100 });
    const customer = await createCustomer(m.UserModel, { email: `guest-merge-${Date.now()}@example.test` });

    const agent = request.agent(ctx.app);

    // Pre-seed the account's own cart directly (simulates a prior authenticated session)
    // with the SAME product already in it, so the merge must sum quantities, not duplicate the line.
    await extra.CartModel.create({
      userId: customer._id,
      items: [{ productId: product._id, variantId: null, quantity: 3, priceAtAdd: 100 }],
    });

    // Shop as a guest on this same agent (same cookie jar) before logging in.
    const addRes = await agent
      .post('/api/v1/cart/items')
      .send({ productId: String(product._id), quantity: 5 });
    assert.equal(addRes.status, 200);
    const guestSessionCookie = guestCookieFrom(addRes);
    assert.ok(guestSessionCookie);

    // Price changes between "add to guest cart" and "login" — the merge must use the CURRENT price.
    await extra.ProductModel.updateOne({ _id: product._id }, { basePrice: 150 });

    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'Test-Password-123!' });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.data.otpRequired, false);

    // The guest cookie must be cleared after a successful merge.
    const clearedCookie = guestCookieFrom(loginRes);
    assert.ok(clearedCookie, 'expected the guest cookie to be explicitly cleared on login');
    assert.ok(/mc_guest_cart=;/.test(clearedCookie!) || /Expires=Thu, 01 Jan 1970/.test(clearedCookie!));

    const mergedCart = await extra.CartModel.findOne({ userId: customer._id }).lean();
    assert.ok(mergedCart);
    assert.equal(mergedCart!.items.length, 1);
    assert.equal(mergedCart!.items[0].quantity, 8); // 3 (account) + 5 (guest)
    assert.equal(mergedCart!.items[0].priceAtAdd, 150); // re-priced, not the guest's stale 100

    const orphanGuestCart = await extra.CartModel.findOne({ sessionId: { $ne: null } });
    assert.equal(orphanGuestCart, null, 'guest cart document must be deleted after a successful merge');
  });

  test('login without any guest cart present succeeds normally (merge is a no-op, never blocks auth)', async () => {
    const customer = await createCustomer(m.UserModel, { email: `no-guest-cart-${Date.now()}@example.test` });

    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: customer.email, password: 'Test-Password-123!' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.otpRequired, false);
    assert.ok(res.body.data.accessToken);
  });

  test('an authenticated customer\'s own cart flow is unaffected by the guest-cart change', async () => {
    const product = await seedProduct();
    const customer = await createCustomer(m.UserModel, { email: `auth-cart-${Date.now()}@example.test` });
    const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;

    const addRes = await request(ctx.app)
      .post('/api/v1/cart/items')
      .set('Authorization', token)
      .send({ productId: String(product._id), quantity: 1 });
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.data.items.length, 1);

    // An authenticated request must never be treated as a guest, regardless of any stray cookie.
    assert.equal(guestCookieFrom(addRes), undefined);

    const getRes = await request(ctx.app).get('/api/v1/cart').set('Authorization', token);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.data.items.length, 1);
  });
});
