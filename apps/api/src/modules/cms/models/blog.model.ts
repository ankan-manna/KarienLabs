import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const blogSchema = new Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  excerpt: { type: String, default: '' },
  content: { type: String, required: true },
  coverImageUrl: { type: String, default: '' },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tags: { type: [String], default: [] },
  isPublished: { type: Boolean, default: false, index: true },
  publishedAt: { type: Date, default: null },
  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
  },
});

blogSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
blogSchema.index({ title: 'text', content: 'text' });
blogSchema.index({ isPublished: 1, publishedAt: -1 });

auditPlugin(blogSchema);

export type BlogDocument = InferSchemaType<typeof blogSchema>;
export const BlogModel = model('Blog', blogSchema);
