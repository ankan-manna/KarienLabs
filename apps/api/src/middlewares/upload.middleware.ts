import multer from 'multer';

import { ValidationError } from '../utils/app-error';

const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

/**
 * Memory storage, not disk — files are parsed in-process (see excel.util.ts) and
 * never need to touch the filesystem, keeping API containers stateless. Only
 * Excel bulk-import needs a server-side upload; product/prescription images go
 * through the direct-to-Cloudinary signed-upload flow (uploads.routes.ts).
 */
export const uploadExcelFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!EXCEL_MIME_TYPES.includes(file.mimetype)) {
      cb(new ValidationError('Only .xlsx or .xls files are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('file');
