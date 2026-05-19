import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';

vi.mock('../../middleware/rbac.js', () => ({
  requireRole: (..._roles: string[]) =>
    (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../services/image-upload.service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../services/image-upload.service.js')
  >('../../services/image-upload.service.js');
  return {
    ...actual,
    ensureUploadsDir: vi.fn(),
  };
});

import { uploadsRoutes, uploadsErrorHandler } from '../../routes/uploads.routes.js';
import * as imageService from '../../services/image-upload.service.js';

const TEST_UPLOADS_DIR = join(process.cwd(), 'test-uploads-tmp');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'test-user';
    (req as any).userRoles = ['staff-it'];
    next();
  });
  app.use('/api/admin/uploads/images', uploadsRoutes, uploadsErrorHandler);
  return app;
}

// 1x1 red pixel PNG (smallest valid PNG)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

// 1x1 white pixel JPEG
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
  'base64'
);

describe('POST /api/admin/uploads/images', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mkdirSync(TEST_UPLOADS_DIR, { recursive: true });
    vi.spyOn(imageService, 'getUploadsDir').mockReturnValue(TEST_UPLOADS_DIR);
  });

  afterEach(() => {
    rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  it('uploads a valid PNG and returns url + blurPlaceholder', async () => {
    vi.spyOn(imageService, 'processImage').mockResolvedValue({
      webpBuffer: Buffer.from('fake-webp'),
      blurPlaceholder: 'data:image/webp;base64,fakeblur',
    });
    vi.spyOn(imageService, 'saveImage').mockResolvedValue('/uploads/images/test-uuid.webp');

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', TINY_PNG, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('url', '/uploads/images/test-uuid.webp');
    expect(res.body).toHaveProperty('blurPlaceholder', 'data:image/webp;base64,fakeblur');
  });

  it('uploads a valid JPEG and returns 201', async () => {
    vi.spyOn(imageService, 'processImage').mockResolvedValue({
      webpBuffer: Buffer.from('fake-webp'),
      blurPlaceholder: 'data:image/webp;base64,fakeblur',
    });
    vi.spyOn(imageService, 'saveImage').mockResolvedValue('/uploads/images/test-uuid.webp');

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', TINY_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('url');
  });

  it('rejects files larger than 5MB with 413', async () => {
    const app = makeApp();
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 0xff);

    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', bigBuffer, { filename: 'huge.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects non-image MIME types with 400', async () => {
    const app = makeApp();
    const textFile = Buffer.from('hello world');

    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', textFile, { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MIME');
  });

  it('returns 422 when sharp cannot process a corrupt image', async () => {
    vi.spyOn(imageService, 'processImage').mockRejectedValue(new Error('Input buffer is corrupt'));

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', Buffer.from('not-an-image'), { filename: 'bad.png', contentType: 'image/png' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROCESSING_FAILED');
  });

  it('returns 422 when image exceeds pixel limit', async () => {
    vi.spyOn(imageService, 'processImage').mockRejectedValue(
      new Error('Input image exceeds pixel limit of 25000000 pixels')
    );

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', TINY_PNG, { filename: 'huge.png', contentType: 'image/png' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('TOO_LARGE_DIMENSIONS');
  });

  it('returns 507 when disk is full', async () => {
    const enospc = new Error('ENOSPC') as NodeJS.ErrnoException;
    enospc.code = 'ENOSPC';
    vi.spyOn(imageService, 'processImage').mockRejectedValue(enospc);

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', TINY_PNG, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(507);
    expect(res.body.code).toBe('STORAGE_FULL');
  });

  it('returns 503 when upload directory is not writable', async () => {
    const eacces = new Error('EACCES') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    vi.spyOn(imageService, 'processImage').mockRejectedValue(eacces);

    const app = makeApp();
    const res = await request(app)
      .post('/api/admin/uploads/images')
      .attach('image', TINY_PNG, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('WRITE_DENIED');
  });
});

describe('GET /api/admin/uploads/images', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mkdirSync(TEST_UPLOADS_DIR, { recursive: true });
    vi.spyOn(imageService, 'getUploadsDir').mockReturnValue(TEST_UPLOADS_DIR);
  });

  afterEach(() => {
    rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  it('lists uploaded webp files', async () => {
    writeFileSync(join(TEST_UPLOADS_DIR, 'abc.webp'), 'fake');
    writeFileSync(join(TEST_UPLOADS_DIR, 'def.webp'), 'fake');
    writeFileSync(join(TEST_UPLOADS_DIR, 'ignore.txt'), 'not an image');

    const app = makeApp();
    const res = await request(app).get('/api/admin/uploads/images');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('filename');
    expect(res.body[0]).toHaveProperty('url');
    expect(res.body.every((f: any) => f.filename.endsWith('.webp'))).toBe(true);
  });

  it('returns empty array when uploads directory is empty', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/admin/uploads/images');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('DELETE /api/admin/uploads/images/:filename', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mkdirSync(TEST_UPLOADS_DIR, { recursive: true });
    vi.spyOn(imageService, 'getUploadsDir').mockReturnValue(TEST_UPLOADS_DIR);
  });

  afterEach(() => {
    rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  it('deletes an existing file and returns success', async () => {
    const filepath = join(TEST_UPLOADS_DIR, 'to-delete.webp');
    writeFileSync(filepath, 'fake');

    vi.spyOn(imageService, 'deleteImage').mockResolvedValue();

    const app = makeApp();
    const res = await request(app).delete('/api/admin/uploads/images/to-delete.webp');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('rejects path traversal attempts with 400', async () => {
    const app = makeApp();

    const res = await request(app).delete('/api/admin/uploads/images/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILENAME');
  });

  it('rejects filenames without .webp extension with 400', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/admin/uploads/images/malicious.exe');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILENAME');
  });

  it('rejects filenames with directory separators (Express returns 404 for slashes in path params)', async () => {
    const app = makeApp();
    const res = await request(app).delete('/api/admin/uploads/images/sub/dir.webp');

    // Express route matching doesn't match /:filename when the value contains "/"
    // so the request never reaches our handler — 404 is the correct behavior
    expect(res.status).toBe(404);
  });
});

describe('Authorization', () => {
  it('returns 403 when user lacks staff-it role', async () => {
    // Import the real requireRole to test actual access control
    vi.doUnmock('../../middleware/rbac.js');
    const { requireRole: realRequireRole } = await import('../../middleware/rbac.js');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = 'test-user';
      (req as any).userRoles = ['fellow']; // not staff-it
      next();
    });

    const { Router } = await import('express');
    const testRouter = Router();
    testRouter.post('/', realRequireRole('staff-it'), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    app.use('/api/admin/uploads/images', testRouter);

    const res = await request(app)
      .post('/api/admin/uploads/images')
      .send();

    expect(res.status).toBe(403);
  });
});
