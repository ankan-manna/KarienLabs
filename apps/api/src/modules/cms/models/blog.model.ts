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

// The admin Blog form only exposes an `isPublished` toggle — there's no
// separate "publish date" field for an admin to fill in — so without this,
// every published post ends up with `publishedAt: null`, which renders as
// the Unix epoch on the public blog cards AND sorts incorrectly (the public
// listing is `.sort({ publishedAt: -1 })`, so null-dated posts don't sort by
// actual recency). Stamps the real publish time automatically the moment a
// post is published, exactly once — never overwrites an already-set date,
// so intentionally backdating/scheduling a post (by setting `publishedAt`
// directly via the API) still works.
blogSchema.pre('save', function (next) {
  if (this.isPublished && !this.publishedAt) this.publishedAt = new Date();
  next();
});
blogSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as { isPublished?: boolean; publishedAt?: Date | null } | null;
  if (update?.isPublished && !update.publishedAt) update.publishedAt = new Date();
  next();
});

auditPlugin(blogSchema);

export type BlogDocument = InferSchemaType<typeof blogSchema>;
export const BlogModel = model('Blog', blogSchema);
