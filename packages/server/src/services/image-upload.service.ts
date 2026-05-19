import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, resolve, basename } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'images');
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

export async function deleteImage(filename: string): Promise<void> {
  const filepath = resolve(UPLOADS_DIR, filename);
  if (!filepath.startsWith(resolve(UPLOADS_DIR)) || basename(filepath) !== filename) {
    throw new Error('Invalid filename');
  }
  try {
    await unlink(filepath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
