import { PERMISSION_EFFECTS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Per-user permission overrides layered on top of the role's permission set —
 * `grant` adds a permission the user's role doesn't have, `deny` revokes one it
 * does. Consulted by authorize() alongside the role cache; see rbac.middleware.ts.
 */
const userPermissionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    permissionKey: { type: String, required: true },
    effect: { type: String, enum: Object.values(PERMISSION_EFFECTS), required: true },
    reason: { type: String, default: '' },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userPermissionSchema.index({ userId: 1, permissionKey: 1 }, { unique: true });

auditPlugin(userPermissionSchema);

export type UserPermissionDocument = InferSchemaType<typeof userPermissionSchema>;
export const UserPermissionModel = model('UserPermission', userPermissionSchema);
