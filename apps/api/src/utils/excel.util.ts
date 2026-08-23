import ExcelJS from 'exceljs';

import { ValidationError } from './app-error';

/**
 * Part 22/41 — content-sniffing, not just trusting the
 * client-supplied `Content-Type`/extension (upload.middleware.ts's
 * `fileFilter` only checks the declared MIME type, which a client fully
 * controls). A real `.xlsx` file is a ZIP archive and always starts with
 * the ZIP local-file-header magic bytes; anything else is not a `.xlsx`
 * file no matter what filename/MIME type it was uploaded with.
 */
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

function assertLooksLikeXlsx(buffer: Buffer): void {
  const header = buffer.subarray(0, ZIP_MAGIC_BYTES.length);
  const matches = ZIP_MAGIC_BYTES.every((byte, i) => header[i] === byte);
  if (!matches) {
    throw new ValidationError('File does not appear to be a valid .xlsx spreadsheet');
  }
}

/**
 * Part 41 — the classic "CSV/formula injection" defense: any
 * string value that STARTS with one of these characters is interpreted by
 * Excel/Sheets/LibreOffice as a live formula the moment a human opens the
 * file, regardless of which system produced it. A value like
 * `=HYPERLINK("http://evil.example","Click")` typed into a product name
 * (or any other free-text field) would silently become a clickable/
 * executable formula in every later export an admin opens. This has
 * nothing to do with server-side code execution (Node never evaluates
 * spreadsheet formulas) — it's entirely about what happens on the
 * OPENING side once a poisoned value round-trips into an exported file.
 */
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Prefixes a formula-triggering value with a single quote so spreadsheet applications render it as plain text, never evaluate it — the standard, widely-recommended mitigation for this class of issue. */
function sanitizeCellForExport(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  return FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value;
}

/** ExcelJS represents a formula cell as `{ formula, result }`, not a plain scalar — reduce it to its last computed result (or the raw formula text if no cached result exists) so downstream code always sees a plain value, never an object it might blindly stringify or trust. */
function flattenCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'formula' in value) {
    const formulaValue = value as ExcelJS.CellFormulaValue;
    return formulaValue.result ?? formulaValue.formula ?? '';
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
  }
  return value;
}

/** Part 41 — bounds row-processing cost regardless of how a small file achieves a huge logical row count (e.g. shared-string/compression tricks); on top of the 5MB multer size cap (upload.middleware.ts), which only loosely bounds row count. */
const MAX_IMPORT_ROWS = 5000;

/** Parses the first worksheet into an array of plain row objects keyed by header text. */
export async function parseExcelBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  assertLooksLikeXlsx(buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= MAX_IMPORT_ROWS) return;
    const record: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header) record[header] = flattenCellValue(cell.value);
    });
    rows.push(record);
  });

  if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) {
    throw new ValidationError(
      `Sheet has ${sheet.rowCount - 1} data rows, which exceeds the maximum of ${MAX_IMPORT_ROWS} rows per upload`,
    );
  }

  return rows;
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export async function buildExcelBuffer(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  // Part 41 — sanitize every cell value on the way OUT too, not just on
  // import: an export can carry a formula-poisoned string that originated
  // from ANY free-text field (product name, customer name, coupon code,
  // audit metadata, ...), not only from a re-exported bulk-upload file.
  const sanitizedRows = rows.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) sanitized[key] = sanitizeCellForExport(value);
    return sanitized;
  });
  sheet.addRows(sanitizedRows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
