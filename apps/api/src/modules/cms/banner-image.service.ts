import { logger } from '../../config/logger';
import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';

import { BannerModel } from './models/banner.model';

/**
 * Website Design (Storefront Management) Part 5/17 — safe Cloudinary asset
 * lifecycle for banner images. Unlike a product's image `publicId` (always
 * 1:1 with a single product's image slot in this codebase), a banner's
 * uploaded image genuinely CAN be reused across multiple banner records
 * (an admin re-picking an already-uploaded asset for a second banner is a
 * realistic, supported workflow with the current text-URL-paste form, and
 * the new upload widget doesn't prevent it either) — so, unlike
 * `product.service.ts`'s unconditional `destroyAsset` after removing a
 * reference, this checks for OTHER live (non-deleted) banners still
 * pointing at the same `imagePublicId` before ever calling Cloudinary's
 * destroy API. Never throws — a Cloudinary failure must not fail the
 * request that already successfully updated/deleted the banner record
 * (same convention `product.service.ts`'s image mutations already use).
 */
async function destroyIfOrphaned(publicId: string, excludeBannerId: string): Promise<void> {
  const stillReferenced = await BannerModel.exists({
    imagePublicId: publicId,
    _id: { $ne: excludeBannerId },
    deletedAt: null,
  });
  if (stillReferenced) return;

  try {
    await destroyAsset(publicId);
  } catch (err) {
    logger.error({ err, publicId }, 'Failed to delete orphaned banner Cloudinary asset');
  }
}

interface BannerImageFields {
  imagePublicId?: string | null;
}

function idOf(doc: unknown): string {
  return String((doc as { _id: unknown })._id);
}

/** Wired as `afterUpdate` on the banners CRUD router — runs only when the update actually replaced the image. */
export async function handleBannerImageReplaced(
  before: BannerImageFields,
  after: BannerImageFields,
): Promise<void> {
  const oldPublicId = before.imagePublicId;
  if (!oldPublicId || oldPublicId === after.imagePublicId) return;
  await destroyIfOrphaned(oldPublicId, idOf(after));
}

/** Wired as `afterDelete` on the banners CRUD router. */
export async function handleBannerDeleted(before: BannerImageFields): Promise<void> {
  if (!before.imagePublicId) return;
  await destroyIfOrphaned(before.imagePublicId, idOf(before));
}
