import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/**
 * `objectIdSchema.nullable().optional()` (used verbatim across ~9 validators
 * for optional relation fields like `parentId`) rejects an empty string with
 * "Invalid id" — but an empty string is exactly what an admin form's
 * "leave this blank to unset" text/select field naturally submits, not
 * `null`/omitted. Confirmed live: the Categories admin form's blank "Parent
 * Category ID" field 400'd category creation entirely until this existed.
 * Treats `''` (and whitespace-only) the same as "not provided" before the
 * real ObjectId check runs, so callers get exactly the same `string | null |
 * undefined` shape as before — just without punishing the empty-string case
 * every plain HTML form input produces by default.
 */
export const optionalObjectIdSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .refine((v) => v == null || /^[a-f\d]{24}$/i.test(v), { message: 'Invalid id' });

export const bulkIdsSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(500),
});

/**
 * Password policy (Security Center spec item) — min 8 chars plus at least one
 * uppercase, one lowercase, and one digit. Centralized here so every entry
 * point that sets a password (register, reset, change, admin-create) enforces
 * the same rule instead of each validator drifting independently.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

/**
 * Standard 15-character Indian GSTIN format: 2-digit state code, 10-char PAN,
 * 1-digit entity number, 'Z' by default, 1 checksum char. Shared by Seller
 * ( 11) and Warehouse (CAT-02) — both need the same validation, and the
 * later GST engine (TAX-01) will reuse it again rather than each module
 * re-deriving its own regex.
 */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Enter a valid 15-character GSTIN');

/** Two-digit numeric GST state code (the same value embedded as the first two characters of a GSTIN) — kept as its own field on Warehouse per CAT-02 so state comparison at invoice time doesn't require re-parsing a GSTIN string. */
export const stateCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{2}$/, 'State code must be a 2-digit GST state code');
