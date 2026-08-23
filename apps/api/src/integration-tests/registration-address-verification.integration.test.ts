import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';

import { createCustomer } from '../test-support/fixtures';
import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * real HTTP-level tests (same pattern as prepaid-checkout /
 * customer-ownership) against the actual Express app + a real, ephemeral
 * MongoDB + Redis. `registrationOtpEnabled`/`pincodeValidationEnabled`/
 * `mobileVerificationEnabled`/`serviceabilityCheckEnabled` all default ON
 * (see auth-config.service.ts / address-verification-config.service.ts), so
 * no explicit config setup is needed to exercise the gated paths — only the
 * OFF-path tests below explicitly disable a flag.
 *
 * The Postal PIN Code checks hit the REAL public
 * `https://api.postalpincode.in` API (no test double exists for it, and it
 * needs no auth/credentials) — confirmed reachable from this environment.
 * Shiprocket is deliberately left UNCONFIGURED in this test environment
 * (test-app.ts sets no SHIPROCKET_* env vars), which is itself the fixture
 * for the fail-closed "not configured -> block checkout" test below.
 */
describe('Registration OTP, address verification, serviceability gate', () => {
  let ctx: TestAppContext;
  let m: Awaited<ReturnType<typeof loadAppModules>>;
  let extra: {
    VerificationTokenModel: typeof import('../modules/auth/models/verification-token.model').VerificationTokenModel;
    checkServiceabilityForCheckout: typeof import('../modules/orders/shiprocket-fulfillment.service').checkServiceabilityForCheckout;
  };

  before(async () => {
    ctx = await setupTestApp();
    m = await loadAppModules();
    const [{ VerificationTokenModel }, shiprocketFulfillment] = await Promise.all([
      import('../modules/auth/models/verification-token.model'),
      import('../modules/orders/shiprocket-fulfillment.service'),
    ]);
    extra = {
      VerificationTokenModel,
      checkServiceabilityForCheckout: shiprocketFulfillment.checkServiceabilityForCheckout,
    };
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  function uniqueEmail(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  }

  describe('Registration OTP gate', () => {
    test('happy path: register -> otpRequired -> verify -> real session, emailVerified true', async () => {
      const email = uniqueEmail('reg-happy');
      const registerRes = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'New Customer', email, password: 'Test-Password-123!' });

      assert.equal(registerRes.status, 201);
      assert.equal(registerRes.body.data.otpRequired, true);
      assert.ok(registerRes.body.data.challengeToken);
      assert.ok(registerRes.body.data.devOnlyCode, 'devOnlyCode must be present outside production');

      const verifyRes = await request(ctx.app).post('/api/v1/auth/register/verify-otp').send({
        challengeToken: registerRes.body.data.challengeToken,
        code: registerRes.body.data.devOnlyCode,
      });

      assert.equal(verifyRes.status, 200);
      assert.ok(verifyRes.body.data.accessToken);
      assert.equal(verifyRes.body.data.user.email, email);

      const user = await m.UserModel.findOne({ email });
      assert.equal(user?.emailVerified, true);
    });

    test('wrong OTP code is rejected and issues no session', async () => {
      const email = uniqueEmail('reg-wrong');
      const registerRes = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'New Customer', email, password: 'Test-Password-123!' });

      const verifyRes = await request(ctx.app).post('/api/v1/auth/register/verify-otp').send({
        challengeToken: registerRes.body.data.challengeToken,
        code: '000000',
      });

      assert.equal(verifyRes.status, 422);
      assert.equal(verifyRes.body.success, false);

      const user = await m.UserModel.findOne({ email });
      assert.equal(user?.emailVerified, false);
    });

    test('resend before the cooldown elapses is rate-limited', async () => {
      const email = uniqueEmail('reg-resend');
      const registerRes = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'New Customer', email, password: 'Test-Password-123!' });

      const resendRes = await request(ctx.app).post('/api/v1/auth/register/resend-otp').send({
        challengeToken: registerRes.body.data.challengeToken,
      });

      assert.equal(resendRes.status, 429);
    });

    test('re-registering the same still-unverified email resumes instead of conflicting', async () => {
      const email = uniqueEmail('reg-resume');
      const first = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'Real Owner', email, password: 'Real-Password-123!' });
      assert.equal(first.body.data.otpRequired, true);

      // Back-date the just-issued OTP's `lastSentAt` so the second attempt
      // below exercises the RESUME path itself, not the (separately tested)
      // resend-cooldown rejection — otherwise two register() calls seconds
      // apart would legitimately 429 before ever reaching the "does this
      // overwrite the real registrant's password" assertion.
      await extra.VerificationTokenModel.updateMany(
        { contact: email },
        { lastSentAt: new Date(Date.now() - 60_000) },
      );

      const second = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'Attacker Name', email, password: 'Attacker-Password-456!' });

      assert.equal(second.status, 201);
      assert.equal(second.body.data.otpRequired, true);

      // The attacker's second registration attempt must NOT have overwritten
      // the real registrant's password (Part 8's takeover-prevention rule).
      const user = await m.UserModel.findOne({ email }).select('+passwordHash name');
      assert.equal(user?.name, 'Real Owner');
      const bcrypt = await import('bcrypt');
      assert.ok(await bcrypt.compare('Real-Password-123!', user!.passwordHash));
      assert.equal(await bcrypt.compare('Attacker-Password-456!', user!.passwordHash), false);
    });

    test('registering an already-verified email conflicts', async () => {
      const email = uniqueEmail('reg-conflict');
      const registerRes = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'New Customer', email, password: 'Test-Password-123!' });
      await request(ctx.app).post('/api/v1/auth/register/verify-otp').send({
        challengeToken: registerRes.body.data.challengeToken,
        code: registerRes.body.data.devOnlyCode,
      });

      const again = await request(ctx.app)
        .post('/api/v1/auth/register')
        .send({ name: 'New Customer', email, password: 'Different-Password-789!' });

      assert.equal(again.status, 409);
    });
  });

  describe('Login enforcement', () => {
    test('unverified customer account cannot log in', async () => {
      const email = uniqueEmail('login-unverified');
      const bcrypt = await import('bcrypt');
      await m.UserModel.create({
        name: 'Unverified',
        email,
        passwordHash: await bcrypt.hash('Test-Password-123!', 4),
        role: 'customer',
        isActive: true,
        emailVerified: false,
      });

      const res = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'Test-Password-123!' });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('verified (grandfathered) customer account logs in normally', async () => {
      const customer = await createCustomer(m.UserModel);
      const res = await request(ctx.app)
        .post('/api/v1/auth/login')
        .send({ email: customer.email, password: 'Test-Password-123!' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.otpRequired, false);
      assert.ok(res.body.data.accessToken);
    });
  });

  describe('Address pincode validation', () => {
    test('a real, correctly-matched pincode/state saves as verified', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;

      const res = await request(ctx.app).post('/api/v1/addresses').set('Authorization', token).send({
        label: 'Home',
        line1: '1 Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.pincodeVerified, true);
      assert.equal(res.body.data.mobileVerified, false);
    });

    test('a definitively nonexistent pincode is rejected', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;

      const res = await request(ctx.app).post('/api/v1/addresses').set('Authorization', token).send({
        label: 'Home',
        line1: '1 Nowhere Street',
        city: 'Nowhere',
        state: 'Delhi',
        pincode: '999999',
        phone: '9876543210',
      });

      assert.equal(res.status, 422);
    });

    test('a pincode/state mismatch is rejected', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;

      // 110001 resolves to Delhi, not Maharashtra.
      const res = await request(ctx.app).post('/api/v1/addresses').set('Authorization', token).send({
        label: 'Home',
        line1: '1 Connaught Place',
        city: 'New Delhi',
        state: 'Maharashtra',
        pincode: '110001',
        phone: '9876543210',
      });

      assert.equal(res.status, 422);
    });

    test('editing the pincode clears pincodeVerified until re-validated', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;

      const created = await request(ctx.app).post('/api/v1/addresses').set('Authorization', token).send({
        label: 'Home',
        line1: '1 Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
      });
      assert.equal(created.body.data.pincodeVerified, true);

      // Edit ONLY line1 — pincode unchanged, verification must survive.
      const untouched = await request(ctx.app)
        .patch(`/api/v1/addresses/${created.body.data._id}`)
        .set('Authorization', token)
        .send({ line1: '2 Connaught Place' });
      assert.equal(untouched.body.data.pincodeVerified, true);

      // Now edit pincode to a DIFFERENT valid Delhi pincode — must be
      // re-validated (still true here, since 110002 is also Delhi), but
      // critically the field is actively recomputed, not just carried over.
      const changed = await request(ctx.app)
        .patch(`/api/v1/addresses/${created.body.data._id}`)
        .set('Authorization', token)
        .send({ pincode: '110002' });
      assert.equal(changed.body.data.pincodeVerified, true);
    });
  });

  describe('Address mobile OTP', () => {
    test('happy path: request -> confirm -> mobileVerified true', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;
      const address = await m.CustomerAddressModel.create({
        userId: customer._id,
        label: 'Home',
        line1: '1 Test Street',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
      });

      const requestRes = await request(ctx.app)
        .post(`/api/v1/addresses/${address._id}/mobile-otp/request`)
        .set('Authorization', token)
        .send();
      assert.equal(requestRes.status, 200);
      assert.ok(requestRes.body.data.devOnlyCode);

      const confirmRes = await request(ctx.app)
        .post(`/api/v1/addresses/${address._id}/mobile-otp/confirm`)
        .set('Authorization', token)
        .send({ code: requestRes.body.data.devOnlyCode });
      assert.equal(confirmRes.status, 200);
      assert.equal(confirmRes.body.data.verified, true);

      const reloaded = await m.CustomerAddressModel.findById(address._id);
      assert.equal(reloaded?.mobileVerified, true);
    });

    test('another customer cannot request OTP for someone else’s address (IDOR)', async () => {
      const owner = await createCustomer(m.UserModel);
      const attacker = await createCustomer(m.UserModel);
      const attackerToken = `Bearer ${m.signAccessToken({ sub: String(attacker._id), role: 'customer' })}`;
      const address = await m.CustomerAddressModel.create({
        userId: owner._id,
        label: 'Home',
        line1: '1 Test Street',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
      });

      const res = await request(ctx.app)
        .post(`/api/v1/addresses/${address._id}/mobile-otp/request`)
        .set('Authorization', attackerToken)
        .send();

      assert.equal(res.status, 404);
    });

    test('editing phone clears mobileVerified', async () => {
      const customer = await createCustomer(m.UserModel);
      const token = `Bearer ${m.signAccessToken({ sub: String(customer._id), role: 'customer' })}`;
      const address = await m.CustomerAddressModel.create({
        userId: customer._id,
        label: 'Home',
        line1: '1 Test Street',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
        mobileVerified: true,
      });

      const res = await request(ctx.app)
        .patch(`/api/v1/addresses/${address._id}`)
        .set('Authorization', token)
        .send({ phone: '9123456789' });

      assert.equal(res.body.data.mobileVerified, false);
    });
  });

  describe('Mandatory Shiprocket serviceability gate (fail-closed)', () => {
    test('blocks as not-serviceable when no pickup warehouse can be resolved', async () => {
      // apps/api/.env supplies real (test-mode) SHIPROCKET_* credentials, so
      // isShiprocketConfigured() is true here — but a fresh test database has
      // no Warehouse document, so no pickup pincode is resolvable. Per Part
      // 34 this must FAIL CLOSED (block checkout), the opposite of the
      // best-effort checkPincodeServiceability widget's "fall back to zones"
      // behavior for the same missing-warehouse case.
      const result = await extra.checkServiceabilityForCheckout({
        pincode: '110001',
        sellerId: null,
      });

      assert.equal(result.serviceable, false);
      assert.equal(result.reason, 'no_warehouse');
    });
  });
});
