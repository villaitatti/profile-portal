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
  const isClientError = status >= 400 && status < 500;
  const defaultClientCode =
    status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'REQUEST_ERROR';

  res.status(status).json({
    error: isClientError ? err.message : 'Internal Server Error',
    code: err.code || (isClientError ? defaultClientCode : 'INTERNAL_ERROR'),
    ...(isDev && { message: err.message }),
  });
}
