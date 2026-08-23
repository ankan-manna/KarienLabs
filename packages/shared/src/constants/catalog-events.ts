/**
 * Part 13 — named audit actions for catalog/batch/bundle admin
 * operations, distinct from the generic 'create'/'update'/'delete' verbs
 * already used elsewhere, so an audit-log reader can tell "a product was
 * edited" apart from "a batch's MRP override was changed" or "a batch was
 * recalled" without diffing the before/after payload.
 */
export const CATALOG_AUDIT_ACTIONS = {
  ADMIN_UPDATED_PRODUCT: 'ADMIN_UPDATED_PRODUCT',
  ADMIN_CREATED_BATCH: 'ADMIN_CREATED_BATCH',
  ADMIN_UPDATED_BATCH_MRP: 'ADMIN_UPDATED_BATCH_MRP',
  ADMIN_RECALLED_BATCH: 'ADMIN_RECALLED_BATCH',
  ADMIN_UNRECALLED_BATCH: 'ADMIN_UNRECALLED_BATCH',
  ADMIN_CREATED_BUNDLE: 'ADMIN_CREATED_BUNDLE',
  ADMIN_UPDATED_BUNDLE: 'ADMIN_UPDATED_BUNDLE',
  ADMIN_DELETED_BUNDLE: 'ADMIN_DELETED_BUNDLE',
} as const;

export type CatalogAuditAction =
  (typeof CATALOG_AUDIT_ACTIONS)[keyof typeof CATALOG_AUDIT_ACTIONS];
