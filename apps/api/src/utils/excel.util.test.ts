import assert from 'node:assert/strict';
import { test } from 'node:test';

import ExcelJS from 'exceljs';

import { buildExcelBuffer, parseExcelBuffer } from './excel.util';

async function buildTestWorkbookBuffer(rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  const headers = Object.keys(rows[0] ?? {});
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map((h) => row[h]));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

test('parseExcelBuffer rejects a buffer that is not a real .xlsx file (content-sniffing, Part 22)', async () => {
  const fakeExcelFile = Buffer.from('this is not a real spreadsheet, just plain text pretending to be one');
  await assert.rejects(() => parseExcelBuffer(fakeExcelFile), /does not appear to be a valid \.xlsx/);
});

test('parseExcelBuffer rejects an empty/garbage buffer', async () => {
  await assert.rejects(() => parseExcelBuffer(Buffer.from([0x00, 0x01, 0x02])));
});

test('parseExcelBuffer parses a real, well-formed .xlsx file correctly', async () => {
  const buffer = await buildTestWorkbookBuffer([{ name: 'Paracetamol', sku: 'PARA500', price: 25 }]);
  const rows = await parseExcelBuffer(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Paracetamol');
  assert.equal(rows[0].sku, 'PARA500');
  assert.equal(rows[0].price, 25);
});

test('parseExcelBuffer enforces a maximum row count', async () => {
  const rows = Array.from({ length: 5001 }, (_, i) => ({ name: `Product ${i}` }));
  const buffer = await buildTestWorkbookBuffer(rows);
  await assert.rejects(() => parseExcelBuffer(buffer), /exceeds the maximum/);
});

test('buildExcelBuffer neutralizes a formula-injection payload (CSV/formula injection)', async () => {
  const maliciousRows = [{ name: '=HYPERLINK("http://evil.example","Click me")', sku: 'SAFE1' }];
  const buffer = await buildExcelBuffer('Products', [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'SKU', key: 'sku', width: 20 },
  ], maliciousRows);

  // Read the exported file back and confirm the dangerous value was
  // neutralized (prefixed so it's rendered as literal text, not evaluated
  // as a live formula by whoever opens the exported sheet).
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  const cellValue = sheet.getRow(2).getCell(1).value;
  assert.equal(typeof cellValue, 'string');
  assert.ok((cellValue as string).startsWith("'="), `expected a neutralized value, got: ${cellValue}`);
});

test('buildExcelBuffer leaves ordinary values completely unmodified', async () => {
  const rows = [{ name: 'Paracetamol 500mg', sku: 'PARA500' }];
  const buffer = await buildExcelBuffer('Products', [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'SKU', key: 'sku', width: 20 },
  ], rows);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getRow(2).getCell(1).value, 'Paracetamol 500mg');
});

test('buildExcelBuffer neutralizes every formula-trigger character, not just "="', async () => {
  const rows = [
    { name: '+1+1' },
    { name: '-2+3' },
    { name: '@SUM(A1)' },
  ];
  const buffer = await buildExcelBuffer('Products', [{ header: 'Name', key: 'name', width: 30 }], rows);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  for (let i = 2; i <= 4; i++) {
    const value = sheet.getRow(i).getCell(1).value as string;
    assert.ok(value.startsWith("'"), `row ${i} value "${value}" was not neutralized`);
  }
});
