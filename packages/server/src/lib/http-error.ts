import { ErrorCodes, type ErrorCode } from '@itatti/shared';

/**
 * Error carrying an HTTP contract. Thrown from a route or service and rendered
 * by middleware/error.ts as `{ error: message, code, details? }` with the
 * given status — the single way to produce an intentional non-500 response
 * from anywhere below the route layer.
 *
 * `code` is SCREAMING_SNAKE (see ErrorCodes in @itatti/shared for the shared
 * vocabulary; endpoint-specific codes are allowed but follow the same casing).
 *
 * Not for domain outcomes the client branches on — the send-email/preview
 * endpoints deliberately return typed `{ reason }` bodies (SendBioEmailReason
 * et al.) that the web layer maps to i18n keys; those are responses, not
 * errors, and stay hand-rendered in their routes.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, message, ErrorCodes.VALIDATION_ERROR, details);
  }

  static notFound(message: string): HttpError {
    return new HttpError(404, message, ErrorCodes.NOT_FOUND);
  }

  static conflict(message: string, code: string, details?: unknown): HttpError {
    return new HttpError(409, message, code, details);
  }
}

export type { ErrorCode };
