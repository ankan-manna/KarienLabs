import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DOCUMENT_TYPES } from '@medcommerce/shared';

import {
  assertDocumentSizeWithinLimit,
  assertValidPdfBuffer,
  assertValidPrescriptionFile,
  buildDocumentObjectKey,
  buildLogObjectKey,
  buildPrescriptionObjectKey,
  isPastRetention,
} from './storage.util';

test('buildDocumentObjectKey is deterministic — same inputs always produce the same key (Part 20 idempotency)', () => {
  const date = new Date('2026-03-15T00:00:00Z');
  const a = buildDocumentObjectKey({
    documentType: DOCUMENT_TYPES.INVOICE,
    sellerId: 'seller123',
    entityId: 'INV-A-2026-000001',
    date,
  });
  const b = buildDocumentObjectKey({
    documentType: DOCUMENT_TYPES.INVOICE,
    sellerId: 'seller123',
    entityId: 'INV-A-2026-000001',
    date,
  });
  assert.equal(a, b);
  assert.equal(a, 'invoices/seller123/2026/03/INV-A-2026-000001.pdf');
});

test('buildDocumentObjectKey: invoice vs shipping-label use distinct prefixes (Part 3 conceptual structure)', () => {
  const date = new Date('2026-03-15T00:00:00Z');
  const invoiceKey = buildDocumentObjectKey({
    documentType: DOCUMENT_TYPES.INVOICE,
    sellerId: 'seller1',
    entityId: 'entity1',
    date,
  });
  const labelKey = buildDocumentObjectKey({
    documentType: DOCUMENT_TYPES.SHIPPING_LABEL,
    sellerId: 'seller1',
    entityId: 'entity1',
    date,
  });
  assert.match(invoiceKey, /^invoices\//);
  assert.match(labelKey, /^shipping-labels\//);
});

test('buildDocumentObjectKey: null sellerId falls back to "unassigned", never a blank path segment', () => {
  const key = buildDocumentObjectKey({
    documentType: DOCUMENT_TYPES.INVOICE,
    sellerId: null,
    entityId: 'entity1',
    date: new Date('2026-01-01T00:00:00Z'),
  });
  assert.equal(key, 'invoices/unassigned/2026/01/entity1.pdf');
});

test('buildLogObjectKey: predictable logs/{category}/YYYY/MM/DD/{instance}/{category}.{bucket}.log.gz structure (Prompt 18 Part 9/10)', () => {
  const key = buildLogObjectKey({
    category: 'api-application',
    bucketLabel: '2026-08-05-06',
    instanceId: 'host-1',
  });
  assert.equal(key, 'logs/api-application/2026/08/05/host-1/api-application.2026-08-05-06.log.gz');
});

test('buildLogObjectKey: same category+bucket+instance is idempotent across retries (Part 16)', () => {
  const params = { category: 'api-third-party-api', bucketLabel: '2026-08-05-12', instanceId: 'host-1' };
  assert.equal(buildLogObjectKey(params), buildLogObjectKey(params));
});

test('buildLogObjectKey: different instances never collide on the same bucket (multi-replica safety)', () => {
  const a = buildLogObjectKey({ category: 'api-application', bucketLabel: '2026-08-05-06', instanceId: 'host-1' });
  const b = buildLogObjectKey({ category: 'api-application', bucketLabel: '2026-08-05-06', instanceId: 'host-2' });
  assert.notEqual(a, b);
});

test('isPastRetention: a file exactly at the boundary counts as expired (>=)', () => {
  const now = new Date('2026-01-21T00:00:00Z');
  const fileDate = new Date('2026-01-01T00:00:00Z'); // exactly 20 days earlier
  assert.equal(isPastRetention(fileDate, 20, now), true);
});

test('isPastRetention: a file one day under the window is NOT expired', () => {
  const now = new Date('2026-01-20T00:00:00Z');
  const fileDate = new Date('2026-01-01T00:00:00Z'); // 19 days earlier
  assert.equal(isPastRetention(fileDate, 20, now), false);
});

test('assertValidPdfBuffer accepts a %PDF-prefixed buffer', () => {
  assert.doesNotThrow(() => assertValidPdfBuffer(Buffer.from('%PDF-1.4 rest of file')));
});

test('assertValidPdfBuffer rejects an empty buffer', () => {
  assert.throws(() => assertValidPdfBuffer(Buffer.alloc(0)), /empty/);
});

test('assertValidPdfBuffer rejects a non-PDF buffer (e.g. an HTML error page from a failed fetch)', () => {
  assert.throws(() => assertValidPdfBuffer(Buffer.from('<html>Not Found</html>')), /not a valid PDF/);
});

test('assertDocumentSizeWithinLimit rejects an oversized buffer', () => {
  const huge = Buffer.alloc(26 * 1024 * 1024); // 26MB > 25MB ceiling
  assert.throws(() => assertDocumentSizeWithinLimit(huge), /exceeds/);
});

test('assertDocumentSizeWithinLimit accepts a normal-sized buffer', () => {
  assert.doesNotThrow(() => assertDocumentSizeWithinLimit(Buffer.alloc(1024)));
});

// --- Prompt 17: prescription-specific helpers ---

test('buildPrescriptionObjectKey follows the documented prescriptions/{customerId}/{year}/{month}/{prescriptionId}/{file} structure (Part 11)', () => {
  const key = buildPrescriptionObjectKey({
    customerId: 'cust123',
    prescriptionId: 'presc456',
    fileName: 'my-scan.jpg',
    date: new Date('2026-05-10T00:00:00Z'),
  });
  assert.equal(key, 'prescriptions/cust123/2026/05/presc456/my-scan.jpg');
});

test('buildPrescriptionObjectKey sanitizes an unsafe filename rather than rejecting the upload outright', () => {
  const key = buildPrescriptionObjectKey({
    customerId: 'cust123',
    prescriptionId: 'presc456',
    fileName: '../../etc/passwd; rm -rf.pdf',
    date: new Date('2026-05-10T00:00:00Z'),
  });
  assert.ok(!key.includes('..'));
  assert.ok(!key.includes(';'));
  assert.ok(!key.includes('/passwd'));
});

test('assertValidPrescriptionFile accepts PDF/JPG/PNG within the size ceiling', () => {
  assert.doesNotThrow(() =>
    assertValidPrescriptionFile({ mimeType: 'application/pdf', fileName: 'rx.pdf', fileSize: 1024 }),
  );
  assert.doesNotThrow(() =>
    assertValidPrescriptionFile({ mimeType: 'image/jpeg', fileName: 'rx.jpg', fileSize: 1024 }),
  );
  assert.doesNotThrow(() =>
    assertValidPrescriptionFile({ mimeType: 'image/png', fileName: 'rx.png', fileSize: 1024 }),
  );
});

test('assertValidPrescriptionFile rejects an unsupported MIME type (Part 9/48 — never accept arbitrary executables)', () => {
  assert.throws(
    () =>
      assertValidPrescriptionFile({
        mimeType: 'application/x-msdownload',
        fileName: 'rx.exe',
        fileSize: 1024,
      }),
    /Unsupported file type/,
  );
});

test('assertValidPrescriptionFile rejects a mismatched/unsupported extension even with an allowed-looking MIME type', () => {
  assert.throws(
    () =>
      assertValidPrescriptionFile({ mimeType: 'application/pdf', fileName: 'rx.exe', fileSize: 1024 }),
    /Unsupported file extension/,
  );
});

test('assertValidPrescriptionFile rejects an oversized file', () => {
  assert.throws(
    () =>
      assertValidPrescriptionFile({
        mimeType: 'application/pdf',
        fileName: 'rx.pdf',
        fileSize: 11 * 1024 * 1024,
      }),
    /exceeds/,
  );
});

test('assertValidPrescriptionFile rejects an empty file', () => {
  assert.throws(
    () => assertValidPrescriptionFile({ mimeType: 'application/pdf', fileName: 'rx.pdf', fileSize: 0 }),
    /empty/,
  );
});
