import { Schema, model, type InferSchemaType } from 'mongoose';

/** Admin-panel "Activity Timeline" feed per resource — lighter-weight than AuditLog's before/after diff, just a human-readable trail. */
const activityLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  resource: { type: String, required: true, index: true },
  resourceId: { type: Schema.Types.ObjectId, required: true, index: true },
  message: { type: String, required: true }, // "Changed status from placed to confirmed"
  createdAt: { type: Date, default: Date.now },
});

activityLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

export type ActivityLogDocument = InferSchemaType<typeof activityLogSchema>;
export const ActivityLogModel = model('ActivityLog', activityLogSchema);
