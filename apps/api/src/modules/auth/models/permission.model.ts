import { ACTIONS, RESOURCES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Canonical permission catalog — lets the admin UI list/assign permissions without hardcoding strings. */
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true }, // e.g. "orders:refund"
    resource: { type: String, required: true, enum: Object.values(RESOURCES) },
    action: { type: String, required: true, enum: Object.values(ACTIONS) },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

permissionSchema.index({ resource: 1, action: 1 }, { unique: true });

auditPlugin(permissionSchema);

export type PermissionDocument = InferSchemaType<typeof permissionSchema>;
export const PermissionModel = model('Permission', permissionSchema);
