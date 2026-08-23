import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractTemplateVariables, validateTemplateVariables } from './notification-template-variables.util';

// Part 18/19 — never allow a template to reference a
// forbidden/secret-shaped variable name, and only allow variables the
// specific templateKey is known to legitimately use.

test('extractTemplateVariables: finds simple placeholders', () => {
  const vars = extractTemplateVariables('Hello {{customerName}}, your order {{orderNumber}} shipped.');
  assert.deepEqual(vars.sort(), ['customerName', 'orderNumber']);
});

test('extractTemplateVariables: ignores block-helper keywords (if/each/unless/with)', () => {
  const vars = extractTemplateVariables('{{#if status}}{{status}}{{/if}} {{#each items}}{{name}}{{/each}}');
  assert.deepEqual(vars.sort(), ['items', 'name', 'status']);
});

test('extractTemplateVariables: dotted paths reduce to the root variable', () => {
  const vars = extractTemplateVariables('{{order.number}} {{order.total}}');
  assert.deepEqual(vars, ['order']);
});

test('extractTemplateVariables: deduplicates repeated references', () => {
  const vars = extractTemplateVariables('{{code}} is your code. Again: {{code}}.');
  assert.deepEqual(vars, ['code']);
});

test('validateTemplateVariables: accepts a whitelisted variable for a known template key', () => {
  assert.doesNotThrow(() => validateTemplateVariables('order_status_changed', 'Hi {{name}}, order {{orderNumber}} is {{status}}.'));
});

test('validateTemplateVariables: rejects a variable outside the known-key whitelist', () => {
  assert.throws(
    () => validateTemplateVariables('order_status_changed', 'Refund of {{refundAmount}} processed.'),
    /disallowed variable/,
  );
});

test('validateTemplateVariables: globally forbidden variables are rejected everywhere', () => {
  for (const forbidden of ['password', 'jwt', 'apiKey', 'paymentSecret', 'accessToken', 'cvv']) {
    assert.throws(
      () => validateTemplateVariables('order_status_changed', `{{${forbidden}}}`),
      new RegExp(forbidden, 'i'),
      `expected ${forbidden} to be rejected`,
    );
  }
});

test('validateTemplateVariables: {{code}} is allowed ONLY for the two OTP template keys', () => {
  assert.doesNotThrow(() => validateTemplateVariables('login_otp', 'Your code is {{code}}. Expires in {{expiryMinutes}}m.'));
  assert.doesNotThrow(() => validateTemplateVariables('password_reset_otp', 'Your code is {{code}}.'));
});

test('validateTemplateVariables: {{code}} is REJECTED for every other template key', () => {
  assert.throws(() => validateTemplateVariables('order_status_changed', 'Your code: {{code}}'), /disallowed/);
  assert.throws(() => validateTemplateVariables('unknown_custom_key', 'Your code: {{code}}'), /disallowed/);
});

test('validateTemplateVariables: an UNKNOWN template key only enforces the global blocklist, not a whitelist', () => {
  // A genuinely new admin-authored template — no whitelist entry exists for it,
  // so any non-forbidden variable name is allowed.
  assert.doesNotThrow(() => validateTemplateVariables('my_new_custom_template', '{{anything}} {{goes}} {{here}}'));
});

test('validateTemplateVariables: an unknown key still rejects forbidden variables', () => {
  assert.throws(() => validateTemplateVariables('my_new_custom_template', '{{password}}'), /disallowed/);
});

test('validateTemplateVariables: lists every disallowed variable in one error, not just the first', () => {
  try {
    validateTemplateVariables('order_status_changed', '{{password}} and {{jwt}} and {{refundAmount}}');
    assert.fail('expected to throw');
  } catch (err) {
    const message = (err as Error).message;
    assert.match(message, /password/i);
    assert.match(message, /jwt/i);
    assert.match(message, /refundAmount/i);
  }
});

test('validateTemplateVariables: checks both subject and body when combined (as the model hook does)', () => {
  assert.throws(
    () => validateTemplateVariables('order_status_changed', 'Subject: {{password}}\nBody: hello'),
    /disallowed/,
  );
});
