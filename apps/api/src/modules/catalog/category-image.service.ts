import { logger } from '../../config/logger';
import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';

import { CategoryModel } from './models/category.model';

/**
 * Safe Cloudinary asset lifecycle for category images — mirrors
 * cms/banner-image.service.ts's `destroyIfOrphaned` pattern exactly (a
 * category image, like a banner image, can in principle be re-picked for
 * more than one category via the shared Cloudinary upload widget, so this
 * checks for other live categories still referencing the same
 * `imagePublicId` before ever calling Cloudinary's destroy API). Never
 * throws — a Cloudinary failure must not fail the request that already
 * successfully updated/deleted the category record.
 */
async function destroyIfOrphaned(publicId: string, excludeCategoryId: string): Promise<void> {
  const stillReferenced = await CategoryModel.exists({
    imagePublicId: publicId,
    _id: { $ne: excludeCategoryId },
    deletedAt: null,
  });
  if (stillReferenced) return;

  try {
    await destroyAsset(publicId);
  } catch (err) {
    logger.error({ err, publicId }, 'Failed to delete orphaned category Cloudinary asset');
  }
}

interface CategoryImageFields {
  imagePublicId?: string | null;
}

function idOf(doc: unknown): string {
  return String((doc as { _id: unknown })._id);
}

/** Called after a category update that actually replaced the image. */
export async function handleCategoryImageReplaced(
  before: CategoryImageFields,
  after: CategoryImageFields,
): Promise<void> {
  const oldPublicId = before.imagePublicId;
  if (!oldPublicId || oldPublicId === after.imagePublicId) return;
  await destroyIfOrphaned(oldPublicId, idOf(after));
}

/** Called after a category is soft-deleted. */
export async function handleCategoryImageDeleted(before: CategoryImageFields & { _id: unknown }): Promise<void> {
  if (!before.imagePublicId) return;
  await destroyIfOrphaned(before.imagePublicId, idOf(before));
}
