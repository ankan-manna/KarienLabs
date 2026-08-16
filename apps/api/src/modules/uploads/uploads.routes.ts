import { Router } from 'express';
import { z } from 'zod';

import { createUploadSignature } from '../../integrations/cloudinary/cloudinary.service';
import { requireAuth } from '../../middlewares/auth.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../utils/validate';

export const uploadsRouter = Router();

const signatureSchema = z.object({
  preset: z.enum([
    'product_thumbnail',
    'prescription_secure',
    'cms_media',
    'profile_picture',
    // Prompt 16 Part 3/33 — customer-submitted return evidence photos, via
    // the SAME signed-upload flow every other customer upload already uses.
    'return_evidence',
  ]),
  folder: z.string().trim().min(1).max(200),
});

uploadsRouter.post(
  '/signature',
  requireAuth,
  validate(signatureSchema),
  asyncHandler(async (req, res) => {
    const payload = await createUploadSignature(req.body);
    return sendSuccess(res, payload);
  }),
);
