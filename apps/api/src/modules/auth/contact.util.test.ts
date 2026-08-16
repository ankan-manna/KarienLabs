import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maskContact, resolveOtpContact } from './contact.util';

test('resolveOtpContact uses email when configured channel is email', () => {
  const { contact, channel } = resolveOtpContact(
    { email: 'jane@example.com', phone: '+911234567890' },
    'email',
  );
  assert.equal(contact, 'jane@example.com');
  assert.equal(channel, 'email');
});

test('resolveOtpContact uses phone for sms/whatsapp when the user has one', () => {
  const sms = resolveOtpContact({ email: 'jane@example.com', phone: '+911234567890' }, 'sms');
  assert.equal(sms.contact, '+911234567890');
  assert.equal(sms.channel, 'sms');

  const wa = resolveOtpContact({ email: 'jane@example.com', phone: '+911234567890' }, 'whatsapp');
  assert.equal(wa.contact, '+911234567890');
  assert.equal(wa.channel, 'whatsapp');
});

test('resolveOtpContact falls back to email for sms/whatsapp when the user has no phone on file', () => {
  const { contact, channel } = resolveOtpContact({ email: 'jane@example.com', phone: null }, 'sms');
  assert.equal(contact, 'jane@example.com');
  assert.equal(channel, 'email');
});

test('maskContact partially hides an email local-part', () => {
  assert.equal(maskContact('jane@example.com'), 'ja**@example.com');
  assert.equal(maskContact('jo@example.com'), 'jo*@example.com');
});

test('maskContact partially hides a phone number', () => {
  assert.equal(maskContact('+911234567890'), '***********90');
});
