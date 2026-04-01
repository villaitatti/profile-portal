import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function errorHandler(
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.status || 500;

  if (status >= 500) {
    logger.error({ err, status }, 'Unhandled server error');
  } else {
    logger.warn({ err: err.message, status }, 'Client error');
  }

  const isDev = process.env.NODE_ENV === 'development';

  res.status(status).json({
    error: status === 401 ? 'Unauthorized' : 'Internal Server Error',
    code: err.code || (status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_ERROR'),
    ...(isDev && { message: err.message }),
  });
}
