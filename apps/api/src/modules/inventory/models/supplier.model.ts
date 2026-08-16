import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const supplierSchema = new Schema({
  name: { type: String, required: true, trim: true },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  contactPersons: {
    type: [
      {
        name: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' },
        role: { type: String, default: '' },
      },
    ],
    default: [],
  },
  phone: { type: String, default: '' },
  email: { type: String, default: '', lowercase: true, trim: true },
  address: { type: String, default: '' },
  paymentTerms: { type: String, default: '' },
  bankDetails: {
    type: {
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
    },
    default: () => ({}),
  },
  performanceRating: { type: Number, min: 0, max: 5, default: null },
  isActive: { type: Boolean, default: true },
});

supplierSchema.index({ name: 1 });

auditPlugin(supplierSchema);

export type SupplierDocument = InferSchemaType<typeof supplierSchema>;
export const SupplierModel = model('Supplier', supplierSchema);
