import { CONFIGURATION_NAMESPACES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * One flexible, namespaced settings store — matches  1's "Configuration
 * Driven Architecture" (a single `configurations` collection, Redis-cached,
 * admin-editable) rather than nine near-identical *Settings collections
 * (Global/Business/Invoice/Payment/Shipping/Email/SMS/Razorpay/Cloudinary).
 * `value` shape is namespace-specific and validated at the service layer with a
 * per-namespace Zod schema before writing — not enforced here in Mongoose.
 */
const configurationSchema = new Schema({
  namespace: {
    type: String,
    enum: Object.values(CONFIGURATION_NAMESPACES),
    required: true,
    unique: true,
  },
  value: { type: Schema.Types.Mixed, required: true, default: {} },
});

auditPlugin(configurationSchema);

export type ConfigurationDocument = InferSchemaType<typeof configurationSchema>;
export const ConfigurationModel = model('Configuration', configurationSchema);
