import { Schema, model, type InferSchemaType } from 'mongoose';

const tagSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
});

export type TagDocument = InferSchemaType<typeof tagSchema>;
export const TagModel = model('Tag', tagSchema);
