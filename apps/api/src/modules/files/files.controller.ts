import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as filesService from './files.service';

export const confirmUploadHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await filesService.confirmUpload(req.body, req.user!.id));
});

export const deleteFileHandler = asyncHandler(async (req, res) => {
  await filesService.deleteFile(req.params.publicId);
  return sendSuccess(res, { deleted: true });
});

export const listFilesHandler = asyncHandler(async (req, res) => {
  const { relatedModel, relatedId } = req.query as { relatedModel?: string; relatedId?: string };
  return sendSuccess(res, await filesService.listFiles(relatedModel, relatedId));
});
