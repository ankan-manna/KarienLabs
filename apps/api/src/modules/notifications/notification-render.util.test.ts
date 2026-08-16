import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMockDataForTemplate, renderTemplateString } from './notification-render.util';

test('renderTemplateString: substitutes simple variables', () => {
  const out = renderTemplateString('Hello {{name}}, order {{orderNumber}} confirmed.', {
    name: 'Asha',
    orderNumber: 'ORD-123',
  });
  assert.equal(out, 'Hello Asha, order ORD-123 confirmed.');
});

test('renderTemplateString: missing variables render as empty, never throw', () => {
  const out = renderTemplateString('Hello {{name}}!', {});
  assert.equal(out, 'Hello !');
});

test('buildMockDataForTemplate: generates a safe, obviously-synthetic value per placeholder', () => {
  const mock = buildMockDataForTemplate('Order {{orderNumber}}', 'Hi {{customerName}}, total {{orderTotal}}.');
  assert.equal(mock.orderNumber, 'Sample orderNumber');
  assert.equal(mock.customerName, 'Sample customerName');
  assert.equal(mock.orderTotal, 'Sample orderTotal');
});

test('buildMockDataForTemplate: never uses a real-looking OTP for {{code}}, but a labeled sample', () => {
  const mock = buildMockDataForTemplate('Your code', 'Code: {{code}}');
  assert.equal(mock.code, '123456');
});

test('buildMockDataForTemplate + renderTemplateString: preview never requires or touches real data', () => {
  const subject = 'Order {{orderNumber}} update';
  const body = 'Hi {{customerName}}, your order is {{status}}.';
  const mock = buildMockDataForTemplate(subject, body);
  const renderedSubject = renderTemplateString(subject, mock);
  const renderedBody = renderTemplateString(body, mock);
  assert.ok(renderedSubject.includes('Sample orderNumber'));
  assert.ok(renderedBody.includes('Sample customerName'));
  assert.ok(renderedBody.includes('Sample status'));
});

test('buildMockDataForTemplate: deduplicates a variable referenced in both subject and body', () => {
  const mock = buildMockDataForTemplate('{{orderNumber}}', '{{orderNumber}} again');
  assert.equal(Object.keys(mock).length, 1);
});
