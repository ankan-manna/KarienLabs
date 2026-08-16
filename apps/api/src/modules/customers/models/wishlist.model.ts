import { Schema, model, type InferSchemaType } from 'mongoose';

/** One document per user with an embedded item array — fast toggle add/remove, avoids collection bloat. */
const wishlistSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: {
    type: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
});

export type WishlistDocument = InferSchemaType<typeof wishlistSchema>;
export const WishlistModel = model('Wishlist', wishlistSchema);
