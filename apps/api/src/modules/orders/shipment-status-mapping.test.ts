import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SHIPMENT_STATUS, SHIPROCKET_STATUS_MAP } from '@medcommerce/shared';

const VALID_STATUSES = new Set<string>(Object.values(SHIPMENT_STATUS));

test('Part 23: every SHIPROCKET_STATUS_MAP value is a real internal SHIPMENT_STATUS — no invented parallel status vocabulary', () => {
  for (const [external, internal] of Object.entries(SHIPROCKET_STATUS_MAP)) {
    assert.ok(
      VALID_STATUSES.has(internal),
      `Shiprocket status "${external}" maps to "${internal}", which is not a real SHIPMENT_STATUS`,
    );
  }
});

test('key Shiprocket lifecycle statuses map to the expected internal status', () => {
  assert.equal(SHIPROCKET_STATUS_MAP['shipped'], SHIPMENT_STATUS.PICKED_UP);
  assert.equal(SHIPROCKET_STATUS_MAP['out for delivery'], SHIPMENT_STATUS.OUT_FOR_DELIVERY);
  assert.equal(SHIPROCKET_STATUS_MAP['delivered'], SHIPMENT_STATUS.DELIVERED);
  assert.equal(SHIPROCKET_STATUS_MAP['rto initiated'], SHIPMENT_STATUS.RTO);
  assert.equal(SHIPROCKET_STATUS_MAP['delivery failed'], SHIPMENT_STATUS.FAILED);
});

test('unrecognized/unmapped external status is not present — callers must treat a missing key as "no transition", never guess', () => {
  assert.equal(SHIPROCKET_STATUS_MAP['some made up courier status'], undefined);
});
