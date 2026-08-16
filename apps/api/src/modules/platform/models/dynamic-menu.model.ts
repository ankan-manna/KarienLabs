import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * A single tree serves both the admin sidebar and top navigation via `placement`,
 * rather than separate SidebarConfiguration/NavigationConfiguration collections —
 * they're the same shape (label/icon/path/order/visibility rules), just rendered
 * in different UI slots.
 */
const dynamicMenuSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true },
  icon: { type: String, default: '' },
  path: { type: String, default: '' },
  placement: { type: String, enum: ['sidebar', 'topnav'], default: 'sidebar' },
  parentId: { type: Schema.Types.ObjectId, ref: 'DynamicMenu', default: null, index: true },
  order: { type: Number, default: 0 },
  requiredPermission: { type: String, default: null },
  requiredRole: { type: String, default: null },
  requiredFeatureFlag: { type: String, default: null },
  isActive: { type: Boolean, default: true },
});

dynamicMenuSchema.index({ placement: 1, parentId: 1, order: 1 });

// Soft-delete + createdBy/updatedBy audit trail, consistent with the rest of the
// admin-managed config collections (see BaseRepository.softDeleteById).
auditPlugin(dynamicMenuSchema);

export type DynamicMenuDocument = InferSchemaType<typeof dynamicMenuSchema>;
export const DynamicMenuModel = model('DynamicMenu', dynamicMenuSchema);
