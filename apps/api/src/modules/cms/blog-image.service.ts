import { logger } from '../../config/logger';
import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';

import { BlogModel } from './models/blog.model';

/**
 * Safe Cloudinary asset lifecycle for blog cover images — mirrors
 * banner-image.service.ts's `destroyIfOrphaned` pattern exactly (a blog
 * cover image can in principle be re-picked for more than one post via the
 * shared Cloudinary upload widget, so this checks for other live posts
 * still referencing the same `coverImagePublicId` before ever calling
 * Cloudinary's destroy API). Never throws — a Cloudinary failure must not
 * fail the request that already successfully updated/deleted the post.
 */
async function destroyIfOrphaned(publicId: string, excludeBlogId: string): Promise<void> {
  const stillReferenced = await BlogModel.exists({
    coverImagePublicId: publicId,
    _id: { $ne: excludeBlogId },
    deletedAt: null,
  });
  if (stillReferenced) return;

  try {
    await destroyAsset(publicId);
  } catch (err) {
    logger.error({ err, publicId }, 'Failed to delete orphaned blog Cloudinary asset');
  }
}

interface BlogImageFields {
  coverImagePublicId?: string | null;
}

function idOf(doc: unknown): string {
  return String((doc as { _id: unknown })._id);
}

/** Wired as `afterUpdate` on the blogs CRUD router — runs only when the update actually replaced the cover image. */
export async function handleBlogImageReplaced(
  before: BlogImageFields,
  after: BlogImageFields,
): Promise<void> {
  const oldPublicId = before.coverImagePublicId;
  if (!oldPublicId || oldPublicId === after.coverImagePublicId) return;
  await destroyIfOrphaned(oldPublicId, idOf(after));
}

/** Wired as `afterDelete` on the blogs CRUD router. */
export async function handleBlogImageDeleted(before: BlogImageFields): Promise<void> {
  if (!before.coverImagePublicId) return;
  await destroyIfOrphaned(before.coverImagePublicId, idOf(before));
}
