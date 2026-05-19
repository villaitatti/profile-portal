import { Router } from 'express';
import multer, { MulterError } from 'multer';
import { requireRole } from '../middleware/rbac.js';
import { KnownRoles } from '@itatti/shared';
import {
  processImage,
  saveImage,
  deleteImage,
  getUploadsDir,
} from '../services/image-upload.service.js';
import { readdir } from 'fs/promises';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_MIME'));
    }
  },
});

const router = Router();

router.post(
  '/',
  requireRole(KnownRoles.STAFF_IT),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image file provided', code: 'NO_FILE' });
        return;
      }

      const { webpBuffer, blurPlaceholder } = await processImage(req.file.buffer);
      const url = await saveImage(webpBuffer);

      res.status(201).json({ url, blurPlaceholder });
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOSPC') {
        res.status(507).json({ error: 'Server storage full', code: 'STORAGE_FULL' });
        return;
      }
      if (nodeErr.code === 'EACCES') {
        res
          .status(503)
          .json({ error: 'Upload directory not writable', code: 'WRITE_DENIED' });
        return;
      }
      if (nodeErr.message?.includes('Input image exceeds pixel limit')) {
        res
          .status(422)
          .json({ error: 'Image dimensions too large (max 25MP)', code: 'TOO_LARGE_DIMENSIONS' });
        return;
      }
      console.error('[uploads] Processing error:', err);
      res.status(422).json({ error: 'Could not process image', code: 'PROCESSING_FAILED' });
    }
  }
);

router.get('/', requireRole(KnownRoles.STAFF_IT), async (_req, res) => {
  try {
    const files = await readdir(getUploadsDir());
    const images = files
      .filter((f) => f.endsWith('.webp'))
      .map((filename) => ({
        url: `/uploads/images/${filename}`,
        filename,
      }));
    res.json(images);
  } catch {
    res.json([]);
  }
});

router.delete('/:filename', requireRole(KnownRoles.STAFF_IT), async (req, res) => {
  const filename = req.params.filename as string;

  if (!filename || filename.includes('..') || filename.includes('/') || !filename.endsWith('.webp')) {
    res.status(400).json({ error: 'Invalid filename', code: 'INVALID_FILENAME' });
    return;
  }

  try {
    await deleteImage(filename);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete image', code: 'DELETE_FAILED' });
  }
});

export function uploadsErrorHandler(
  err: Error,
  _req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'Image must be under 5MB', code: 'FILE_TOO_LARGE' });
    return;
  }
  if (err.message === 'INVALID_MIME') {
    res
      .status(400)
      .json({ error: 'Only PNG, JPEG, and WebP images are allowed', code: 'INVALID_MIME' });
    return;
  }
  next(err);
}

export { router as uploadsRoutes };
