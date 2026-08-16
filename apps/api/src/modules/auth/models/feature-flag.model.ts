import { Schema, model, type InferSchemaType } from 'mongoose';

const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    scope: { type: String, enum: ['global', 'role', 'user'], default: 'global' },
    // Only meaningful when scope is 'role'/'user' respectively — empty means
    // "not yet targeted" rather than "applies to everyone" for a scoped flag.
    targetRoles: { type: [String], default: [] },
    targetUserIds: { type: [Schema.Types.ObjectId], default: [] },
    rolloutPercentage: { type: Number, min: 0, max: 100, default: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type FeatureFlagDocument = InferSchemaType<typeof featureFlagSchema>;
export const FeatureFlagModel = model('FeatureFlag', featureFlagSchema);
