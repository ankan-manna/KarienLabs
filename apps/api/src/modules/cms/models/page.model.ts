import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Generic CMS page by slug — covers Privacy Policy, Terms of Service, About Us, etc. without one collection per page type. */
const pageSchema = new Schema({
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true }, // 'privacy-policy', 'terms'
  title: { type: String, required: true },
  content: { type: String, required: true },
  isPublished: { type: Boolean, default: true },
  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
  },
});

auditPlugin(pageSchema);

export type PageDocument = InferSchemaType<typeof pageSchema>;
export const PageModel = model('Page', pageSchema);
