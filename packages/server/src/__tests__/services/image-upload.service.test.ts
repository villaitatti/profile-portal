import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm, utimes } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Deferred-deletion contract: deleteImage MOVES the file into uploads/trash/
// (never unlinks), so the nightly backup — pg_dump followed by a tar of the
// whole uploads volume — always contains every file a same-night dump can
// reference. pruneTrashedImages then removes entries deleted more than 7 days
// ago, aging them by the timestamp PREFIX deleteImage wrote (rename preserves
// mtime, so file age says when the image was uploaded, not deleted).

vi.mock('../../lib/logger.js', async () => (await import('../helpers/mocks.js')).loggerMock());

// UPLOADS_DIR/TRASH_DIR are derived from process.cwd() at module load, so pin
// cwd to a temp dir BEFORE the (dynamic) import — real fs, no repo pollution.
let base: string;
let imagesDir: string;
let trashDir: string;
let svc: typeof import('../../services/image-upload.service.js');

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'image-upload-test-'));
  imagesDir = join(base, 'uploads', 'images');
  trashDir = join(base, 'uploads', 'trash');
  vi.spyOn(process, 'cwd').mockReturnValue(base);
  svc = await import('../../services/image-upload.service.js');
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

describe('deleteImage', () => {
  it('moves the file into uploads/trash/ with a timestamp-prefixed name instead of unlinking', async () => {
    await mkdir(imagesDir, { recursive: true });
    await writeFile(join(imagesDir, 'abc.webp'), 'image-bytes');

    await svc.deleteImage('abc.webp');

    await expect(readFile(join(imagesDir, 'abc.webp'))).rejects.toMatchObject({ code: 'ENOENT' });
    const trashed = await readdir(trashDir);
    expect(trashed).toHaveLength(1);
    // ISO-ish deletion-moment prefix + original name, e.g.
    // 2026-09-03T09-00-00-000Z_abc.webp — the prefix is what the prune ages by.
    expect(trashed[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_abc\.webp$/);
    await expect(readFile(join(trashDir, trashed[0]), 'utf8')).resolves.toBe('image-bytes');
  });

  it('swallows a missing source file (already deleted)', async () => {
    await expect(svc.deleteImage('never-existed.webp')).resolves.toBeUndefined();
  });

  it('still rejects traversal and nested filenames before touching the filesystem', async () => {
    await expect(svc.deleteImage('../escape.webp')).rejects.toThrow('Invalid filename');
    await expect(svc.deleteImage('nested/name.webp')).rejects.toThrow('Invalid filename');
  });
});

describe('pruneTrashedImages', () => {
  it('removes entries trashed more than 7 days ago and keeps newer ones', async () => {
    await rm(trashDir, { recursive: true, force: true });
    await mkdir(trashDir, { recursive: true });
    const now = new Date('2026-09-10T09:00:00.000Z');
    await writeFile(join(trashDir, '2026-09-01T09-00-00-000Z_old.webp'), 'old'); // 9 days
    await writeFile(join(trashDir, '2026-09-05T09-00-00-000Z_new.webp'), 'new'); // 5 days

    await svc.pruneTrashedImages(now);

    await expect(readdir(trashDir)).resolves.toEqual(['2026-09-05T09-00-00-000Z_new.webp']);
  });

  it('ages by the name prefix, not mtime — a freshly deleted old image survives', async () => {
    // rename preserves mtime: an image uploaded a month ago but deleted
    // yesterday carries an ancient mtime. Pruning by mtime would evict it
    // immediately, defeating the 7-day retention.
    await rm(trashDir, { recursive: true, force: true });
    await mkdir(trashDir, { recursive: true });
    const name = '2026-09-09T09-00-00-000Z_kept.webp'; // deleted 1 day before `now`
    await writeFile(join(trashDir, name), 'kept');
    const ancient = new Date('2026-01-01T00:00:00.000Z');
    await utimes(join(trashDir, name), ancient, ancient);

    await svc.pruneTrashedImages(new Date('2026-09-10T09:00:00.000Z'));

    await expect(readdir(trashDir)).resolves.toEqual([name]);
  });

  it('falls back to mtime for hand-placed files without the prefix', async () => {
    await rm(trashDir, { recursive: true, force: true });
    await mkdir(trashDir, { recursive: true });
    await writeFile(join(trashDir, 'stray.webp'), 'stray');
    const ancient = new Date('2026-01-01T00:00:00.000Z');
    await utimes(join(trashDir, 'stray.webp'), ancient, ancient);

    await svc.pruneTrashedImages(new Date('2026-09-10T09:00:00.000Z'));

    await expect(readdir(trashDir)).resolves.toEqual([]);
  });

  it('never throws when the trash directory does not exist yet', async () => {
    await rm(trashDir, { recursive: true, force: true });

    await expect(svc.pruneTrashedImages()).resolves.toBeUndefined();
  });
});
