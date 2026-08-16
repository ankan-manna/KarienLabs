import { Schema, model, type InferSchemaType } from 'mongoose';

/** Tracks every asset uploaded through the signed-upload flow (cloudinary.service.ts) — `status` covers "upload history" without a second collection. */
const cloudinaryFileSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'raw', 'video'], default: 'image' },
    folder: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    relatedModel: { type: String, default: null }, // 'Product' | 'PrescriptionUpload' | 'Blog' ...
    relatedId: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['uploaded', 'deleted'], default: 'uploaded' },
  },
  { timestamps: true },
);

cloudinaryFileSchema.index({ relatedModel: 1, relatedId: 1 });

export type CloudinaryFileDocument = InferSchemaType<typeof cloudinaryFileSchema>;
export const CloudinaryFileModel = model('CloudinaryFile', cloudinaryFileSchema);
