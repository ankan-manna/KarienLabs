import { NOTIFICATION_CHANNELS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';
import { validateTemplateVariables } from '../notification-template-variables.util';

const notificationTemplateSchema = new Schema({
  key: { type: String, required: true, unique: true }, // 'order_confirmed', 'low_stock_alert', ...
  channel: { type: String, enum: Object.values(NOTIFICATION_CHANNELS), required: true },
  subject: { type: String, default: '' }, // email only
  body: { type: String, required: true }, // Handlebars template source
  isActive: { type: Boolean, default: true },
});

notificationTemplateSchema.index({ key: 1, channel: 1 }, { unique: true });

/**
 * Prompt 20 Part 18/19 — enforced HERE (a Mongoose hook), not just at the
 * HTTP validator layer, so it applies uniformly regardless of entry point
 * (the generic createCrudRouter's create/update, a future script, direct
 * repository use) — never allow a template to reference a forbidden
 * variable name (Part 19: password/otp/jwt/paymentSecret) or one outside
 * its known-safe whitelist (see notification-template-variables.util.ts).
 */
notificationTemplateSchema.pre('validate', function (next) {
  try {
    validateTemplateVariables(this.key, `${this.subject ?? ''}\n${this.body ?? ''}`);
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * The document hook above only fires for `.create()`/`.save()` — the admin
 * CRUD update path (BaseRepository.updateById -> `findByIdAndUpdate`) is
 * QUERY middleware, which Mongoose does NOT run document `pre('validate')`
 * hooks for even with `runValidators: true` (that option only re-runs
 * SchemaType validators like `required`/`enum`, not custom document
 * middleware). Without this second hook, an admin could create a compliant
 * template then EDIT it to add a forbidden variable and it would sail
 * through unchecked.
 */
notificationTemplateSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const update = this.getUpdate() as Record<string, unknown> & { $set?: Record<string, unknown> };
    const patch = { ...update, ...(update?.$set ?? {}) };
    if (patch.key === undefined && patch.subject === undefined && patch.body === undefined) {
      return next(); // nothing relevant to this validation is being changed.
    }
    const current = (await this.model.findOne(this.getQuery()).lean()) as {
      key?: string;
      subject?: string;
      body?: string;
    } | null;
    const key = (patch.key as string | undefined) ?? current?.key;
    const subject = (patch.subject as string | undefined) ?? current?.subject ?? '';
    const body = (patch.body as string | undefined) ?? current?.body ?? '';
    if (key) validateTemplateVariables(key, `${subject}\n${body}`);
    next();
  } catch (error) {
    next(error as Error);
  }
});

auditPlugin(notificationTemplateSchema);

export type NotificationTemplateDocument = InferSchemaType<typeof notificationTemplateSchema>;
export const NotificationTemplateModel = model('NotificationTemplate', notificationTemplateSchema);
