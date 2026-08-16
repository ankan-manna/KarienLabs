import { destroyAsset } from '../../integrations/cloudinary/cloudinary.service';
import { NotFoundError } from '../../utils/app-error';

import { CloudinaryFileModel } from './models/cloudinary-file.model';

interface ConfirmUploadInput {
  publicId: string;
  url: string;
  resourceType?: 'image' | 'raw' | 'video';
  folder?: string;
  sizeBytes?: number;
  relatedModel?: string;
  relatedId?: string;
}

/** Client uploaded directly to Cloudinary (see uploads.routes.ts's signature endpoint); this registers the resulting asset so it's tracked/attributable/deletable from the admin panel. */
export async function confirmUpload(input: ConfirmUploadInput, actorId: string) {
  return CloudinaryFileModel.create({ ...input, uploadedBy: actorId });
}

export async function deleteFile(publicId: string) {
  const file = await CloudinaryFileModel.findOne({ publicId });
  if (!file) throw new NotFoundError('File');

  await destroyAsset(publicId);
  file.status = 'deleted';
  await file.save();
}

export function listFiles(relatedModel?: string, relatedId?: string) {
  const filter: Record<string, unknown> = { status: 'uploaded' };
  if (relatedModel) filter.relatedModel = relatedModel;
  if (relatedId) filter.relatedId = relatedId;
  return CloudinaryFileModel.find(filter).sort({ createdAt: -1 }).lean();
}
