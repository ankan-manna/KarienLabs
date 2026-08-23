import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RETURN_STATUS, RETURN_STATUS_TRANSITIONS } from '@medcommerce/shared';

test('the full happy-path resolves-as-refund sequence is a chain of valid transitions', () => {
  const path = [
    RETURN_STATUS.REQUESTED,
    RETURN_STATUS.APPROVED,
    RETURN_STATUS.PICKED_UP,
    RETURN_STATUS.RECEIVED,
    RETURN_STATUS.INSPECTED,
    RETURN_STATUS.REFUNDED,
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(
      RETURN_STATUS_TRANSITIONS[path[i]].includes(path[i + 1]),
      `${path[i]} -> ${path[i + 1]} should be a valid transition`,
    );
  }
});

test('the resolves-as-replacement path is equally valid from INSPECTED', () => {
  assert.ok(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.INSPECTED].includes(RETURN_STATUS.REPLACED));
});

test('a request can be rejected directly, or after approval, but never after picked_up/received/inspected', () => {
  assert.ok(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.REQUESTED].includes(RETURN_STATUS.REJECTED));
  assert.ok(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.APPROVED].includes(RETURN_STATUS.REJECTED));
  assert.ok(!RETURN_STATUS_TRANSITIONS[RETURN_STATUS.PICKED_UP].includes(RETURN_STATUS.REJECTED));
  assert.ok(!RETURN_STATUS_TRANSITIONS[RETURN_STATUS.RECEIVED].includes(RETURN_STATUS.REJECTED));
});

test('terminal states allow no further transitions (idempotency/concurrency guard)', () => {
  assert.deepEqual(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.REJECTED], []);
  assert.deepEqual(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.REFUNDED], []);
  assert.deepEqual(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.REPLACED], []);
});

test('RECEIVED never jumps straight to a resolution; INSPECTED is mandatory (the QC gate cannot be skipped)', () => {
  assert.deepEqual(RETURN_STATUS_TRANSITIONS[RETURN_STATUS.RECEIVED], [RETURN_STATUS.INSPECTED]);
  assert.ok(!RETURN_STATUS_TRANSITIONS[RETURN_STATUS.RECEIVED].includes(RETURN_STATUS.REFUNDED));
  assert.ok(!RETURN_STATUS_TRANSITIONS[RETURN_STATUS.RECEIVED].includes(RETURN_STATUS.REPLACED));
});

test('every status referenced as a transition target is itself a real RETURN_STATUS value', () => {
  const valid = new Set(Object.values(RETURN_STATUS));
  for (const targets of Object.values(RETURN_STATUS_TRANSITIONS)) {
    for (const target of targets) assert.ok(valid.has(target));
  }
});
