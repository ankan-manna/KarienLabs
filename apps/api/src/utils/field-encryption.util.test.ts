import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';

import { env } from '../config/env';

import {
  __resetKeyCacheForTesting,
  decryptSensitiveConfigFields,
  encryptSensitiveConfigFields,
} from './field-encryption.util';

const originalKey = env.CONFIG_ENCRYPTION_KEY;
const TEST_KEY = randomBytes(32).toString('base64');

before(() => {
  env.CONFIG_ENCRYPTION_KEY = TEST_KEY;
  __resetKeyCacheForTesting();
});

after(() => {
  env.CONFIG_ENCRYPTION_KEY = originalKey;
  __resetKeyCacheForTesting();
});

test('encrypts a known sensitive field name (keySecret) and round-trips back to the original plaintext', () => {
  const original = { keyId: 'rzp_live_abc123', keySecret: 'super-secret-value', webhookSecret: 'wh-secret' };
  const encrypted = encryptSensitiveConfigFields(original) as typeof original;

  assert.notEqual(encrypted.keySecret, original.keySecret, 'the stored value must not equal the plaintext');
  assert.notEqual(encrypted.webhookSecret, original.webhookSecret);
  assert.equal(encrypted.keyId, original.keyId, 'non-sensitive fields must be left untouched');

  const decrypted = decryptSensitiveConfigFields(encrypted) as typeof original;
  assert.equal(decrypted.keySecret, original.keySecret);
  assert.equal(decrypted.webhookSecret, original.webhookSecret);
  assert.equal(decrypted.keyId, original.keyId);
});

test('the encrypted ciphertext never contains the plaintext secret as a substring', () => {
  const plaintext = 'rzp_test_super_secret_do_not_leak_1234567890';
  const encrypted = encryptSensitiveConfigFields({ keySecret: plaintext }) as { keySecret: string };
  assert.equal(encrypted.keySecret.includes(plaintext), false);
});

test('the SAME plaintext encrypted twice produces DIFFERENT ciphertext (random IV, not deterministic)', () => {
  const a = encryptSensitiveConfigFields({ apiSecret: 'same-value' }) as { apiSecret: string };
  const b = encryptSensitiveConfigFields({ apiSecret: 'same-value' }) as { apiSecret: string };
  assert.notEqual(a.apiSecret, b.apiSecret);
});

test('re-encrypting an already-encrypted value is a no-op (idempotent on save)', () => {
  const once = encryptSensitiveConfigFields({ keySecret: 'value' }) as { keySecret: string };
  const twice = encryptSensitiveConfigFields(once) as { keySecret: string };
  assert.equal(once.keySecret, twice.keySecret);
});

test('nested objects and arrays are walked recursively', () => {
  const original = {
    aws: { secretAccessKey: 'aws-secret-value', region: 'ap-south-1' },
    providers: [{ smtpPassword: 'smtp-secret-1' }, { smtpPassword: 'smtp-secret-2' }],
  };
  const encrypted = encryptSensitiveConfigFields(original) as typeof original;
  assert.notEqual(encrypted.aws.secretAccessKey, original.aws.secretAccessKey);
  assert.equal(encrypted.aws.region, 'ap-south-1');
  assert.notEqual(encrypted.providers[0].smtpPassword, original.providers[0].smtpPassword);
  assert.notEqual(encrypted.providers[1].smtpPassword, original.providers[1].smtpPassword);

  const decrypted = decryptSensitiveConfigFields(encrypted) as typeof original;
  assert.equal(decrypted.aws.secretAccessKey, original.aws.secretAccessKey);
  assert.equal(decrypted.providers[0].smtpPassword, original.providers[0].smtpPassword);
  assert.equal(decrypted.providers[1].smtpPassword, original.providers[1].smtpPassword);
});

test('non-sensitive fields (feature toggles, numbers, booleans) are left completely unmodified', () => {
  const original = { enabled: true, retryCount: 3, label: 'Production' };
  const encrypted = encryptSensitiveConfigFields(original);
  assert.deepEqual(encrypted, original);
});

test('gracefully degrades to plaintext (no throw) when CONFIG_ENCRYPTION_KEY is not configured', () => {
  env.CONFIG_ENCRYPTION_KEY = '';
  __resetKeyCacheForTesting();
  try {
    const original = { keySecret: 'plaintext-because-unconfigured' };
    const result = encryptSensitiveConfigFields(original);
    assert.deepEqual(result, original, 'must pass through unchanged, not throw, when no key is configured');
  } finally {
    env.CONFIG_ENCRYPTION_KEY = TEST_KEY;
    __resetKeyCacheForTesting();
  }
});

test('a plaintext (legacy, pre-encryption) value already in storage is returned as-is by decrypt, not mangled', () => {
  const legacyPlainValue = { keySecret: 'never-was-encrypted' };
  const decrypted = decryptSensitiveConfigFields(legacyPlainValue) as typeof legacyPlainValue;
  assert.equal(decrypted.keySecret, 'never-was-encrypted');
});

test('decrypting with the WRONG key fails safe (empty string, never throws, never returns garbage as if valid)', () => {
  const encrypted = encryptSensitiveConfigFields({ keySecret: 'original-value' }) as { keySecret: string };

  env.CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('base64'); // a DIFFERENT key
  __resetKeyCacheForTesting();
  try {
    const decrypted = decryptSensitiveConfigFields(encrypted) as { keySecret: string };
    assert.equal(decrypted.keySecret, '');
  } finally {
    env.CONFIG_ENCRYPTION_KEY = TEST_KEY;
    __resetKeyCacheForTesting();
  }
});

test('a malformed CONFIG_ENCRYPTION_KEY (wrong length) disables encryption rather than crashing', () => {
  env.CONFIG_ENCRYPTION_KEY = 'too-short-to-be-a-real-key';
  __resetKeyCacheForTesting();
  try {
    const original = { keySecret: 'value' };
    assert.doesNotThrow(() => encryptSensitiveConfigFields(original));
    const result = encryptSensitiveConfigFields(original);
    assert.deepEqual(result, original);
  } finally {
    env.CONFIG_ENCRYPTION_KEY = TEST_KEY;
    __resetKeyCacheForTesting();
  }
});
