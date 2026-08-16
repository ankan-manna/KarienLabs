import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PRESCRIPTION_CONFIG, validatePrescriptionConfig } from './prescription-config.util';

test('Part 40 — a fully default, valid config passes validation untouched', () => {
  assert.doesNotThrow(() => validatePrescriptionConfig(DEFAULT_PRESCRIPTION_CONFIG));
});

test('Part 40 — an unknown key is rejected (whitelist enforcement)', () => {
  const withUnknownKey = { ...DEFAULT_PRESCRIPTION_CONFIG, 'prescription.xyz': true } as never;
  assert.throws(() => validatePrescriptionConfig(withUnknownKey), /Unknown prescription configuration key/);
});

const ALL_OFF = {
  managementEnabled: false,
  uploadEnabled: false,
  verificationEnabled: false,
  reuseEnabled: false,
  orderBlockingEnabled: false,
  checkoutUploadRequired: false,
  validityEnabled: false,
  validityDays: 180,
};

test('Part 43 — verification cannot be enabled while management is disabled', () => {
  const next = { ...ALL_OFF, verificationEnabled: true };
  assert.throws(() => validatePrescriptionConfig(next), /Cannot enable verificationEnabled/);
});

test('Part 43 — reuse cannot be enabled while management is disabled', () => {
  const next = { ...ALL_OFF, reuseEnabled: true };
  assert.throws(() => validatePrescriptionConfig(next), /Cannot enable reuseEnabled/);
});

test('Part 41 — disabling management while every dependent is ALSO turned off is a valid, safe transition', () => {
  assert.doesNotThrow(() => validatePrescriptionConfig(ALL_OFF));
});

test('Part 43 — verification cannot be enabled while upload is disabled, even if management is on', () => {
  const next = { ...DEFAULT_PRESCRIPTION_CONFIG, uploadEnabled: false, verificationEnabled: true };
  assert.throws(() => validatePrescriptionConfig(next), /Cannot enable prescription verification or reuse/);
});

test('Part 43 — reuse cannot be enabled while upload is disabled', () => {
  const next = { ...DEFAULT_PRESCRIPTION_CONFIG, uploadEnabled: false, reuseEnabled: true };
  assert.throws(() => validatePrescriptionConfig(next), /Cannot enable prescription verification or reuse/);
});

test('Part 20 — validityDays must be a positive, finite number', () => {
  assert.throws(
    () => validatePrescriptionConfig({ ...DEFAULT_PRESCRIPTION_CONFIG, validityDays: 0 }),
    /validityDays must be a positive number/,
  );
  assert.throws(
    () => validatePrescriptionConfig({ ...DEFAULT_PRESCRIPTION_CONFIG, validityDays: -5 }),
    /validityDays must be a positive number/,
  );
});

test('disabling upload while verification/reuse are already off (and management stays on) is valid', () => {
  const next = {
    ...DEFAULT_PRESCRIPTION_CONFIG,
    uploadEnabled: false,
    verificationEnabled: false,
    reuseEnabled: false,
  };
  assert.doesNotThrow(() => validatePrescriptionConfig(next));
});
