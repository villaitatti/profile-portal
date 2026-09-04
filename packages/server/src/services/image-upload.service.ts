import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { writeFile, unlink, mkdir, rename, readdir, stat } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { logger } from '../lib/logger.js';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'images');
// Sibling of images/ inside the same uploads volume (so rename never crosses
// devices) but OUTSIDE the /uploads/images static mount (routes/index.ts) —
// trashed files are never publicly served.
const TRASH_DIR = join(process.cwd(), 'uploads', 'trash');
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_PIXELS = 25_000_000;
const OUTPUT_WIDTH = 800;
const OUTPUT_HEIGHT = 450;
const BLUR_WIDTH = 10;

export async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

export async function processImage(
  buffer: Buffer
): Promise<{ webpBuffer: Buffer; blurPlaceholder: string }> {
  const webpBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();

  const blurBuffer = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .resize(BLUR_WIDTH, Math.round(BLUR_WIDTH * (OUTPUT_HEIGHT / OUTPUT_WIDTH)), {
      fit: 'cover',
    })
    .webp({ quality: 20 })
    .toBuffer();

  const blurPlaceholder = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  return { webpBuffer, blurPlaceholder };
}

export async function saveImage(webpBuffer: Buffer): Promise<string> {
  await ensureUploadsDir();
  const filename = `${randomUUID()}.webp`;
  const filepath = join(UPLOADS_DIR, filename);
  await writeFile(filepath, webpBuffer);
  return `/uploads/images/${filename}`;
}

/**
 * Deferred deletion: moves the file to uploads/trash/ instead of unlinking.
 * The nightly backup runs pg_dump and then tars the whole uploads volume; a
 * file unlinked between the two could be referenced by the dump yet absent
 * from the archive. With the move, every file a same-night dump references is
 * in the paired archive — live or under trash/. Entries are removed after
 * TRASH_RETENTION_MS by pruneTrashedImages (boot + daily cron).
 */
export async function deleteImage(filename: string): Promise<void> {
  const filepath = resolve(UPLOADS_DIR, filename);
  if (!filepath.startsWith(resolve(UPLOADS_DIR)) || basename(filepath) !== filename) {
    throw new Error('Invalid filename');
  }
  await mkdir(TRASH_DIR, { recursive: true });
  // Timestamp prefix avoids collisions and records the deletion moment for the
  // prune — rename preserves mtime, so file age says when the image was
  // uploaded, not when it was deleted. `filename` is separator-free (checked
  // above), so the target stays inside TRASH_DIR.
  const trashName = `${new Date().toISOString().replace(/[:.]/g, '-')}_${filename}`;
  try {
    await rename(filepath, join(TRASH_DIR, trashName));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

// Deletion moment encoded by deleteImage: an ISO timestamp with ':' and '.'
// replaced by '-' (filesystem-safe), e.g. 2026-09-03T09-00-00-000Z_<uuid>.webp.
const TRASH_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/;

function trashedAtMs(name: string, fallbackMtimeMs: number): number {
  const m = TRASH_NAME_PATTERN.exec(name);
  // A file without the prefix was placed by hand — age it by mtime.
  if (!m) return fallbackMtimeMs;
  return Date.parse(`${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`);
}

/**
 * Removes uploads/trash/ entries deleted more than TRASH_RETENTION_MS ago —
 * long enough that any recent backup's dump can still find the files it
 * references in the paired archive, short enough that trash never dominates
 * the volume. Never throws: callers are boot and the daily cron tick, where a
 * prune failure must only log.
 */
export async function pruneTrashedImages(now: Date = new Date()): Promise<void> {
  try {
    const entries = await readdir(TRASH_DIR);
    const cutoff = now.getTime() - TRASH_RETENTION_MS;
    for (const name of entries) {
      const filepath = join(TRASH_DIR, name);
      const info = await stat(filepath);
      if (trashedAtMs(name, info.mtimeMs) < cutoff) {
        await unlink(filepath);
        logger.info({ name }, 'Pruned trashed upload past retention');
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // nothing trashed yet
    logger.error({ err }, 'Failed to prune uploads trash');
  }
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
