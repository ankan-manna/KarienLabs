import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const faqSchema = new Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  category: { type: String, default: 'general' },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

faqSchema.index({ category: 1, order: 1 });

auditPlugin(faqSchema);

export type FaqDocument = InferSchemaType<typeof faqSchema>;
export const FaqModel = model('Faq', faqSchema);
