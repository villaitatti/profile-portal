import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ErrorCodes } from '@itatti/shared';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/http-error.js';
import { env } from '../env.js';

// The one place that turns thrown errors into HTTP responses. Every body it
// produces has the shape { error, code, details? }. Routes should throw
// HttpError (or let errors propagate) rather than hand-rendering error JSON;
// the exception is the typed `{ reason }` domain-outcome bodies documented in
// lib/http-error.ts.
export function errorHandler(
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error({ err, status: err.status }, 'Server error');
    } else {
      logger.warn({ err: err.message, code: err.code, status: err.status }, 'Client error');
    }
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // A ZodError reaching this handler is malformed input that escaped a
  // validate() middleware (e.g. schema.parse in a service) — a client error,
  // not a server fault. Without this branch it fell through to the 500 path
  // and was logged as an unhandled server error.
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues }, 'Validation error reached error middleware');
    res.status(400).json({
      error: 'Validation error',
      code: ErrorCodes.VALIDATION_ERROR,
      details: err.issues,
    });
    return;
  }

  const status = err.status || 500;

  if (status >= 500) {
    logger.error({ err, status }, 'Unhandled server error');
  } else {
    logger.warn({ err: err.message, status }, 'Client error');
  }

  // Validated env, not process.env: with NODE_ENV unset the schema defaults to
  // 'development', and the error handler must agree with the rest of the app
  // about which environment it is in.
  const isDev = env.NODE_ENV === 'development';
  const isClientError = status >= 400 && status < 500;
  const defaultClientCode =
    status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'REQUEST_ERROR';

  res.status(status).json({
    error: isClientError ? err.message : 'Internal Server Error',
    code: err.code || (isClientError ? defaultClientCode : 'INTERNAL_ERROR'),
    ...(isDev && { message: err.message }),
  });
}
