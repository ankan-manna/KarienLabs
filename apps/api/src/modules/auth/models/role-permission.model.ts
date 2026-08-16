import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Authoritative role<->permission mapping, editable from the Super Admin UI.
 * `Role.permissions` (see role.model.ts) is a denormalized cache of this table,
 * kept for the fast, no-join lookup `authorize()` needs on every request —
 * write here, then resync the cache (see rbac.middleware.ts's invalidate hook).
 */
const rolePermissionSchema = new Schema(
  {
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    permissionId: { type: Schema.Types.ObjectId, ref: 'Permission', required: true, index: true },
  },
  { timestamps: true },
);

rolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

auditPlugin(rolePermissionSchema);

export type RolePermissionDocument = InferSchemaType<typeof rolePermissionSchema>;
export const RolePermissionModel = model('RolePermission', rolePermissionSchema);
