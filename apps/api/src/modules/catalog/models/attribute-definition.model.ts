import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Admin-configurable catalog of attribute types (e.g. "Dosage Form", "Pack Size")
 * driving the dynamic product form (Prompt 1's Dynamic Form Configuration) — the
 * actual values per product live inline on Product.specifications, not here.
 */
const attributeDefinitionSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true },
  valueType: { type: String, enum: ['text', 'number', 'boolean', 'select'], default: 'text' },
  options: { type: [String], default: [] },
  isFilterable: { type: Boolean, default: false },
  isRequired: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
});

auditPlugin(attributeDefinitionSchema);

export type AttributeDefinitionDocument = InferSchemaType<typeof attributeDefinitionSchema>;
export const AttributeDefinitionModel = model('AttributeDefinition', attributeDefinitionSchema);
