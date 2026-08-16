import type { Express } from 'express';
import type mongoose from 'mongoose';

import { startTestMongo } from './mongo-test-server';
import { startTestRedis } from './redis-test-server';

export interface TestAppContext {
  app: Express;
  mongoUri: string;
  redisUrl: string;
  /** Drops every collection between tests so each test starts from a clean database. */
  resetDatabase: () => Promise<void>;
  teardown: () => Promise<void>;
}

/**
 * Boots the REAL Express app (createApp()) against a real, ephemeral MongoDB
 * replica set and a real Redis instance — no mocks, mirroring how Prompt 21's
 * one-off verify-prompt21.ts script exercised the actual service functions
 * against a real MongoDB connection, just now at the HTTP layer and as a
 * repeatable, automated test fixture instead of a deleted one-off script.
 *
 * IMPORTANT: this must be called (and its env vars set) BEFORE any other
 * `src/**` module is imported, since `config/env.ts` parses `process.env`
 * once, at first import, and is exit-on-failure if required vars are
 * missing. Every caller of this function must therefore avoid static
 * `import`s of app code at the top of the test file — use
 * `loadAppModules()` below (or your own `await import(...)`) after this
 * resolves instead. `env.ts`'s eager `process.exit(1)` on invalid config
 * means getting this ordering wrong fails LOUD (the whole test process
 * exits), not silently.
 */
export async function setupTestApp(): Promise<TestAppContext> {
  const [mongo, redis] = await Promise.all([startTestMongo(), startTestRedis()]);

  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongo.uri;
  process.env.REDIS_URL = redis.url;
  process.env.API_BASE_URL = 'http://localhost:5000';
  process.env.WEB_BASE_URL = 'http://localhost:5173';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.JWT_ACCESS_SECRET = 'test-only-jwt-access-secret-0123456789abcdef';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  // Dummy but well-formed — only ever used to compute/verify HMAC signatures
  // against ourselves within a test (see notification-idempotency test),
  // never a real Razorpay account.
  process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
  process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-key-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-razorpay-webhook-secret';
  // Prompt 24 Part 29 — a real (throwaway, test-only) 32-byte key so
  // integration tests can exercise Configuration field-encryption
  // end-to-end (field-encryption.util.ts) against the real ephemeral
  // MongoDB, not just the pure-function unit tests. Dummy/self-disabling
  // pattern, same as the Razorpay credentials above — never a real key.
  process.env.CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  // Side-effect import registering every Mongoose model (mirrors server.ts),
  // THEN the app itself — both deferred until after the env vars above are set.
  await import('../models.registry');
  const { createApp } = await import('../app');
  const { connectDatabase, disconnectDatabase } = await import('../config/database');
  const { redis: redisClient } = await import('../config/redis');
  const mongooseModule = (await import('mongoose')).default as typeof mongoose;

  await connectDatabase();

  // Mongoose builds indexes in the BACKGROUND after a model first connects —
  // in a real deployment they're long since built by the time real traffic
  // arrives, but in a fresh test database a test can otherwise race a
  // unique-index-backed guarantee (e.g. notification.service.ts's
  // idempotencyKey dedup) before the index actually exists yet. Building
  // them synchronously here makes every test see the same fully-indexed
  // database a production system would.
  await mongooseModule.syncIndexes();

  const app = createApp();

  return {
    app,
    mongoUri: mongo.uri,
    redisUrl: redis.url,
    async resetDatabase() {
      const db = mongooseModule.connection.db;
      if (!db) return;
      const collections = await db.collections();
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
      await redisClient.flushall();
    },
    async teardown() {
      await disconnectDatabase();

      // Every BullMQ queue (invoice/notification-dispatch/shipment-fulfillment/
      // maintenance — see queues/queue.ts) opens its OWN ioredis connection via
      // createQueueConnection(). None of that is reachable from here directly,
      // so close them via the queue module itself; otherwise their default
      // reconnect-retry behavior would keep trying (and keep the process
      // alive) after the ephemeral redis-server below is killed.
      try {
        const {
          invoiceQueue,
          notificationDispatchQueue,
          shipmentFulfillmentQueue,
          maintenanceQueue,
          orderFulfillmentAutomationQueue,
        } = await import('../queues/queue');
        await Promise.all(
          [
            invoiceQueue,
            notificationDispatchQueue,
            shipmentFulfillmentQueue,
            maintenanceQueue,
            orderFulfillmentAutomationQueue,
          ].map((queue) => queue.close()),
        );
      } catch {
        // Best-effort — a missed queue close is covered by --test-force-exit
        // on the test:integration script as a safety net.
      }

      redisClient.disconnect();
      await Promise.all([redis.stop(), mongo.stop()]);
    },
  };
}

/**
 * Dynamically loads the app-code modules integration tests commonly need for
 * seeding fixtures/minting tokens — deferred (like the app import above)
 * until after `setupTestApp()` has set the required env vars.
 */
export async function loadAppModules() {
  const [
    mongooseModule,
    { UserModel },
    { CustomerAddressModel },
    { OrderModel },
    { InvoiceModel },
    { PrescriptionUploadModel },
    { ShipmentModel },
    { ReturnModel },
    { PaymentModel },
    { NotificationHistoryModel },
    { NotificationQueueModel },
    { signAccessToken },
  ] = await Promise.all([
    import('mongoose'),
    import('../modules/auth/models/user.model'),
    import('../modules/customers/models/customer-address.model'),
    import('../modules/orders/models/order.model'),
    import('../modules/invoices/models/invoice.model'),
    import('../modules/customers/models/prescription-upload.model'),
    import('../modules/orders/models/shipment.model'),
    import('../modules/orders/models/return.model'),
    import('../modules/payments/models/payment.model'),
    import('../modules/notifications/models/notification-history.model'),
    import('../modules/notifications/models/notification-queue.model'),
    import('../modules/auth/jwt.util'),
  ]);

  return {
    mongoose: mongooseModule.default,
    UserModel,
    CustomerAddressModel,
    OrderModel,
    InvoiceModel,
    PrescriptionUploadModel,
    ShipmentModel,
    ReturnModel,
    PaymentModel,
    NotificationHistoryModel,
    NotificationQueueModel,
    signAccessToken,
  };
}
