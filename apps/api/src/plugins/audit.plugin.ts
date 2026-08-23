import { Schema } from 'mongoose';

const SOFT_DELETE_METHODS = ['find', 'findOne', 'findOneAndUpdate', 'countDocuments'] as const;

/**
 * Applied to every collection. Adds the audit trail fields
 * (createdBy/updatedBy/deletedAt/deletedBy), timestamps, and an explicit
 * `version` counter (renamed from Mongoose's default `__v`), then wires
 * soft-delete query middleware so `deletedAt: null` docs are excluded by
 * default. Pass `{ withDeleted: true }` as a query option to bypass it
 * (e.g. an admin "trash" view).
 */
export function auditPlugin(schema: Schema): void {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  });

  schema.set('timestamps', true);
  schema.set('versionKey', 'version');

  schema.index({ deletedAt: 1 });

  function excludeDeleted(this: {
    getFilter(): Record<string, unknown>;
    getOptions(): Record<string, unknown>;
  }) {
    const filter = this.getFilter();
    const options = this.getOptions();
    if (filter.deletedAt === undefined && options.withDeleted !== true) {
      filter.deletedAt = null;
    }
  }

  for (const method of SOFT_DELETE_METHODS) {
    schema.pre(method, excludeDeleted);
  }
}
