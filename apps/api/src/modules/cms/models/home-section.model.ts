import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Admin-configurable homepage layout — e.g. "Best Sellers", "New Arrivals", driven by a product query, not hardcoded product lists. */
const homeSectionSchema = new Schema({
  title: { type: String, required: true },
  type: {
    type: String,
    // 'category_tabs' (Prompt 4 — Best Sellers category-wise navigation):
    // `categoryIds`, in order, define the tab list + default-active (first)
    // tab; each tab's products are resolved live from the real Product
    // catalog at read time (see public-cms.routes.ts), never duplicated
    // onto this record.
    enum: ['product_grid', 'category_grid', 'banner_carousel', 'category_tabs'],
    required: true,
  },
  sourceType: { type: String, enum: ['manual', 'category', 'tag', 'query'], default: 'manual' },
  productIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
  categoryIds: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
});

homeSectionSchema.index({ isActive: 1, order: 1 });

auditPlugin(homeSectionSchema);

export type HomeSectionDocument = InferSchemaType<typeof homeSectionSchema>;
export const HomeSectionModel = model('HomeSection', homeSectionSchema);
