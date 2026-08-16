import { Schema, model, type InferSchemaType } from 'mongoose';

/** One doc per user (or guest sessionId) with embedded items — matches how a cart is always read/written as a whole. */
const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, default: null, index: true },
    items: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
          quantity: { type: Number, required: true, min: 1 },
          priceAtAdd: { type: Number, required: true },
        },
      ],
      default: [],
    },
    couponCode: { type: String, default: null },
  },
  { timestamps: true },
);

cartSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // abandon guest carts after 30d

export type CartDocument = InferSchemaType<typeof cartSchema>;
export const CartModel = model('Cart', cartSchema);
