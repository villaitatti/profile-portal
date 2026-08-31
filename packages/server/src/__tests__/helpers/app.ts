import express, { type Router, type RequestHandler } from 'express';
import { errorHandler } from '../../middleware/error.js';

/**
 * Minimal Express harness for route tests: JSON body parsing, optional
 * request-mutating middleware (e.g. injecting req.civicrmId or req.userRoles),
 * the router under test, and the real error middleware so tests exercise the
 * production error contract rather than a stub's.
 */
export function makeTestApp(
  mount: string,
  router: Router | RequestHandler,
  ...pre: RequestHandler[]
) {
  const app = express();
  app.use(express.json());
  for (const middleware of pre) app.use(middleware);
  app.use(mount, router);
  app.use(errorHandler);
  return app;
}

/** Middleware factory: sets the fields extractUser would derive from a JWT. */
export function injectUser(fields: {
  userId?: string;
  userRoles?: string[];
  civicrmId?: string;
}): RequestHandler {
  return (req, _res, next) => {
    req.userId = fields.userId ?? 'auth0|test';
    req.userRoles = fields.userRoles ?? [];
    if (fields.civicrmId !== undefined) req.civicrmId = fields.civicrmId;
    next();
  };
}
