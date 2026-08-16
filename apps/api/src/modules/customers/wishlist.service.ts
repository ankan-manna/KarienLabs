import { WishlistModel } from './models/wishlist.model';

export async function getMyWishlist(userId: string) {
  const wishlist = await WishlistModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  ).lean();
  return wishlist;
}

/**
 * Two steps, not one `$addToSet` — a single upsert-with-push filtered on
 * "productId not already present" would fail to match an *existing* wishlist
 * that already contains the product, and Mongo would then try to insert a
 * second document for the same user, colliding with the unique userId index.
 * Ensuring the doc exists first sidesteps that.
 */
export async function addToWishlist(userId: string, productId: string) {
  await WishlistModel.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });

  await WishlistModel.updateOne(
    { userId, 'items.productId': { $ne: productId } },
    { $push: { items: { productId, addedAt: new Date() } } },
  );

  return WishlistModel.findOne({ userId }).lean();
}

export async function removeFromWishlist(userId: string, productId: string) {
  return WishlistModel.findOneAndUpdate(
    { userId },
    { $pull: { items: { productId } } },
    { new: true },
  ).lean();
}
