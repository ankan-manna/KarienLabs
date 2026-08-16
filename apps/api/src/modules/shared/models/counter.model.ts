import { Schema, model } from 'mongoose';

/** Backs atomic, strictly-increasing sequence numbers (order/invoice/PO/GRN numbers) — see sequence.util.ts. */
const counterSchema = new Schema({
  _id: { type: String, required: true }, // sequence key, e.g. "order", "invoice"
  seq: { type: Number, default: 0 },
});

export const CounterModel = model('Counter', counterSchema);
