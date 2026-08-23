/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions on arbitrarily-shaped sanitized output */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeForLogging } from './log-sanitizer';

// Part 22/23/50 — never log passwords/OTP/JWT/API keys/AWS
// creds/card data/prescription content/raw auth headers, at ANY depth.

test('masks a top-level password field', () => {
  const out = sanitizeForLogging({ email: 'a@b.com', password: 'hunter2' }) as Record<string, unknown>;
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.email, 'a@b.com');
});

test('masks sensitive fields nested arbitrarily deep (unlike pino redact wildcards)', () => {
  const out = sanitizeForLogging({
    req: { body: { user: { credentials: { password: 'secret', otp: '123456' } } } },
  }) as any;
  assert.equal(out.req.body.user.credentials.password, '[REDACTED]');
  assert.equal(out.req.body.user.credentials.otp, '[REDACTED]');
});

test('masks JWT/token/refreshToken/accessToken/apiKey/secret variants', () => {
  const out = sanitizeForLogging({
    jwt: 'x',
    accessToken: 'x',
    refreshToken: 'x',
    apiKey: 'x',
    api_key: 'x',
    clientSecret: 'x',
    awsSecretAccessKey: 'x',
  }) as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    assert.equal(out[key], '[REDACTED]', `expected ${key} to be redacted`);
  }
});

test('masks Authorization headers and cookies wherever they appear', () => {
  const out = sanitizeForLogging({ headers: { authorization: 'Bearer abc', cookie: 'session=xyz' } }) as any;
  assert.equal(out.headers.authorization, '[REDACTED]');
  assert.equal(out.headers.cookie, '[REDACTED]');
});

test('masks card/bank fields', () => {
  const out = sanitizeForLogging({ cardNumber: '4111111111111111', cvv: '123', bankAccountNumber: '999' }) as any;
  assert.equal(out.cardNumber, '[REDACTED]');
  assert.equal(out.cvv, '[REDACTED]');
  assert.equal(out.bankAccountNumber, '[REDACTED]');
});

test('masks prescription/document content fields specifically', () => {
  const out = sanitizeForLogging({ prescriptionContent: 'base64...', documentContent: 'base64...' }) as any;
  assert.equal(out.prescriptionContent, '[REDACTED]');
  assert.equal(out.documentContent, '[REDACTED]');
});

test('does not mask unrelated fields', () => {
  const out = sanitizeForLogging({ orderId: 'abc123', status: 'confirmed' }) as any;
  assert.equal(out.orderId, 'abc123');
  assert.equal(out.status, 'confirmed');
});

test('replaces raw Buffer/binary content instead of logging bytes', () => {
  const out = sanitizeForLogging({ fileBuffer: Buffer.from('PDF bytes here') }) as any;
  assert.equal(out.fileBuffer, '[REDACTED]'); // matched by key name too
  const out2 = sanitizeForLogging({ rawBytes: Buffer.from('PDF bytes here') }) as any;
  assert.equal(out2.rawBytes, '[BINARY_OMITTED]');
});

test('truncates very long strings so a stray huge payload cannot flood the log stream', () => {
  const longString = 'a'.repeat(1000);
  const out = sanitizeForLogging({ note: longString }) as any;
  assert.ok((out.note as string).length < 1000);
  assert.match(out.note, /\.\.\.\[TRUNCATED\]$/);
});

test('handles arrays of objects recursively', () => {
  const out = sanitizeForLogging({ items: [{ password: 'a' }, { password: 'b' }] }) as any;
  assert.equal(out.items[0].password, '[REDACTED]');
  assert.equal(out.items[1].password, '[REDACTED]');
});

test('caps recursion depth rather than looping forever on pathological input', () => {
  let deep: any = { password: 'leaf' };
  for (let i = 0; i < 20; i += 1) deep = { nested: deep };
  const out = sanitizeForLogging(deep);
  assert.ok(JSON.stringify(out).includes('MAX_DEPTH_OMITTED'));
});

test('passes through primitives and null/undefined unchanged', () => {
  assert.equal(sanitizeForLogging(null), null);
  assert.equal(sanitizeForLogging(undefined), undefined);
  assert.equal(sanitizeForLogging(42), 42);
  assert.equal(sanitizeForLogging(true), true);
});
