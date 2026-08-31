import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema } from 'zod';
import { ErrorCodes } from '@itatti/shared';

// ── Validation conventions ──────────────────────────────────────────
//
// Body:   validate(schema) middleware below — parses req.body in place.
// Params: zod-parse inline at the TOP of the handler (before any try/catch
//         that maps errors), e.g.
//           const { contactId } = contactIdParams.parse(req.params);
//         The thrown ZodError is rendered by middleware/error.ts as
//         400 { error: 'Validation error', code: 'VALIDATION_ERROR', details }.
// Query:  same as params — schema.parse(req.query) inline, which also applies
//         the schema's defaults/coercions (Express query values are strings).
//
// Rationale: Express 5 forwards both sync throws and async rejections from
// handlers to the error middleware, so inline .parse is safe and keeps the
// parsed (typed, defaulted) value in scope — a res-mutating middleware can't
// hand values to the handler without widening the Request type.

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation error',
        code: ErrorCodes.VALIDATION_ERROR,
        details: result.error.issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Route-param string that must be a positive integer id ("42", not "0",
 * "-1", "1.5" or "abc"), returned as a number. Replaces the hand-rolled
 * `Number.isInteger(Number(raw)) && > 0` check that was copy-pasted across
 * route files.
 */
export const positiveIntIdSchema = z.coerce.number().int().positive();

/** `{ contactId }` params object — the most common param shape in admin routes. */
export const contactIdParamsSchema = z.object({ contactId: positiveIntIdSchema });

/** `{ id }` params object for integer-keyed resources. */
export const idParamsSchema = z.object({ id: positiveIntIdSchema });
