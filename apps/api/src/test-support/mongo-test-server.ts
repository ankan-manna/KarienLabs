import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * A single-member replica set (not a standalone mongod) — several services under
 * test (address.service.ts, order.service.ts's cancelOrder) use
 * `mongoose.startSession().withTransaction(...)`, and MongoDB only supports
 * multi-document transactions against a replica set, even a one-node one.
 *
 * Uses the locally installed `mongod` binary when MONGOMS_SYSTEM_BINARY is set
 * (fast, no download — see apps/api/package.json's test:integration script),
 * otherwise falls back to mongodb-memory-server's own cached/downloaded binary
 * (what CI uses).
 */
export async function startTestMongo(): Promise<{ uri: string; stop: () => Promise<void> }> {
  const systemBinary = process.env.MONGOMS_SYSTEM_BINARY;

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    ...(systemBinary ? { binary: { systemBinary } } : {}),
  });

  return {
    uri: replSet.getUri('medcommerce_test'),
    stop: async () => {
      await replSet.stop();
    },
  };
}
