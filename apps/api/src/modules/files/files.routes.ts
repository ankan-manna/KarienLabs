import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { validate } from '../../utils/validate';

import { confirmUploadHandler, deleteFileHandler, listFilesHandler } from './files.controller';

export const filesRouter = Router();

filesRouter.use(requireAuth);

const confirmSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
  resourceType: z.enum(['image', 'raw', 'video']).optional(),
  folder: z.string().optional(),
  sizeBytes: z.number().optional(),
  relatedModel: z.string().optional(),
  relatedId: z.string().optional(),
});

filesRouter.get('/', listFilesHandler);
filesRouter.post('/', validate(confirmSchema), confirmUploadHandler);
// Cloudinary public_ids commonly include folder slashes (e.g. "products/abc123") —
// a plain `:publicId` segment wouldn't match past the first `/`, so this captures the rest.
filesRouter.delete(
  '/:publicId(*)',
  authorize(permission(RESOURCES.FILES, ACTIONS.DELETE)),
  deleteFileHandler,
);
