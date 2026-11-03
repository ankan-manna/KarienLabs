import { logger } from '../../config/logger';
import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';
import { getConfiguration, setConfiguration } from '../platform/configuration.service';

import type { AboutContentInput } from './about-content.validator';

const NAMESPACE = 'about';

export async function getAboutContent(): Promise<Partial<AboutContentInput>> {
  return (await getConfiguration(NAMESPACE)) as Partial<AboutContentInput>;
}

/**
 * This is a singleton document (one 'about' Configuration row), so — unlike
 * Banner/Category, which can have several records sharing one Cloudinary
 * asset — there is never another record to check before destroying a
 * replaced image: if the public_id actually changed, the old asset is
 * definitionally orphaned. Never throws — a Cloudinary failure must not
 * fail the request that already successfully saved the new content.
 */
async function destroyIfReplaced(oldPublicId: string | null | undefined, newPublicId: string | null | undefined) {
  if (!oldPublicId || oldPublicId === newPublicId) return;
  try {
    await destroyAsset(oldPublicId);
  } catch (err) {
    logger.error({ err, publicId: oldPublicId }, 'Failed to delete orphaned About-content Cloudinary asset');
  }
}

export async function setAboutContent(value: AboutContentInput, actorId: string): Promise<AboutContentInput> {
  const before = (await getConfiguration(NAMESPACE)) as Partial<AboutContentInput>;
  const saved = (await setConfiguration(NAMESPACE, value, actorId)) as AboutContentInput;

  await destroyIfReplaced(before.mainImagePublicId, saved.mainImagePublicId);
  await destroyIfReplaced(before.highlightsImagePublicId, saved.highlightsImagePublicId);

  return saved;
}
