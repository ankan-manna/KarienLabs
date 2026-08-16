import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import mongoose from 'mongoose';

import { loadAppModules, setupTestApp, type TestAppContext } from '../test-support/test-app';

/**
 * Prompt 24 Part 29 — end-to-end (real ephemeral MongoDB, not a pure-function
 * unit test) proof that third-party credentials saved through the
 * Configuration engine are NOT stored in plaintext, while every existing
 * caller of `getConfiguration()` still transparently receives the decrypted
 * plaintext value (i.e. razorpay.client.ts / cloudinary.client.ts /
 * shiprocket.client.ts etc. needed zero changes).
 */
describe('Configuration field encryption at rest (Prompt 24)', () => {
  let ctx: TestAppContext;
  let ConfigurationModel: typeof import('../modules/platform/models/configuration.model').ConfigurationModel;
  let getConfiguration: typeof import('../modules/platform/configuration.service').getConfiguration;
  let setConfiguration: typeof import('../modules/platform/configuration.service').setConfiguration;

  function actorId(): string {
    return new mongoose.Types.ObjectId().toString();
  }

  before(async () => {
    ctx = await setupTestApp();
    await loadAppModules();
    ({ ConfigurationModel } = await import('../modules/platform/models/configuration.model'));
    ({ getConfiguration, setConfiguration } = await import('../modules/platform/configuration.service'));
  });

  after(async () => {
    await ctx.teardown();
  });

  beforeEach(async () => {
    await ctx.resetDatabase();
  });

  test('a Razorpay secret saved via setConfiguration is NOT stored in plaintext in the raw MongoDB document', async () => {
    const plaintext = 'rzp_live_do_not_leak_this_secret';
    await setConfiguration('razorpay', { keyId: 'rzp_live_public_id', keySecret: plaintext }, actorId());

    // Read the RAW document directly, bypassing getConfiguration's decrypt step —
    // this is what an operator with direct DB access, a backup file, or a
    // NoSQL-injection read would actually see.
    const raw = await ConfigurationModel.findOne({ namespace: 'razorpay' }).lean();
    assert.ok(raw, 'expected the configuration document to exist');
    const rawValue = raw!.value as { keyId: string; keySecret: string };

    assert.notEqual(rawValue.keySecret, plaintext, 'the RAW stored value must not be the plaintext secret');
    assert.equal(rawValue.keySecret.startsWith('enc:v1:'), true, 'expected the encrypted-value marker prefix');
    // Non-sensitive fields remain plain/readable in the raw document —
    // proves this is targeted field encryption, not a blanket blob.
    assert.equal(rawValue.keyId, 'rzp_live_public_id');
  });

  test('getConfiguration transparently returns the DECRYPTED plaintext to every normal caller', async () => {
    const plaintext = 'rzp_live_do_not_leak_this_secret';
    await setConfiguration('razorpay', { keyId: 'rzp_live_public_id', keySecret: plaintext }, actorId());

    const config = (await getConfiguration('razorpay')) as { keyId: string; keySecret: string };
    assert.equal(config.keySecret, plaintext);
    assert.equal(config.keyId, 'rzp_live_public_id');
  });

  test('updating a namespace re-encrypts the new value; the old ciphertext is gone', async () => {
    await setConfiguration('razorpay', { keySecret: 'first-secret' }, actorId());
    const firstRaw = await ConfigurationModel.findOne({ namespace: 'razorpay' }).lean();

    await setConfiguration('razorpay', { keySecret: 'second-secret' }, actorId());
    const secondRaw = await ConfigurationModel.findOne({ namespace: 'razorpay' }).lean();

    assert.notEqual(
      (firstRaw!.value as { keySecret: string }).keySecret,
      (secondRaw!.value as { keySecret: string }).keySecret,
    );
    const decrypted = (await getConfiguration('razorpay')) as { keySecret: string };
    assert.equal(decrypted.keySecret, 'second-secret');
  });

  test('a non-secret namespace (e.g. business config) is stored as plain readable JSON, unaffected', async () => {
    await setConfiguration('business', { siteName: 'MedCommerce', supportEmail: 'help@example.com' }, actorId());
    const raw = await ConfigurationModel.findOne({ namespace: 'business' }).lean();
    assert.equal((raw!.value as { siteName: string }).siteName, 'MedCommerce');
  });

  test('the audit trail for a secret-bearing configuration change does NOT contain the plaintext secret', async () => {
    await setConfiguration('razorpay', { keySecret: 'audit-should-not-see-this' }, actorId());

    const { AuditLogModel } = await import('../modules/audit/models/audit-log.model');
    const auditRow = await AuditLogModel.findOne({ resource: 'configuration' }).sort({ createdAt: -1 }).lean();
    assert.ok(auditRow, 'expected a config_change audit record');

    const serialized = JSON.stringify(auditRow!.after);
    assert.equal(serialized.includes('audit-should-not-see-this'), false);
    assert.ok(serialized.includes('REDACTED'), 'expected the secret field to be redacted in the audit record');
  });
});
