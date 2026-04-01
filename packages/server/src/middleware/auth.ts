import type { Request, Response, NextFunction } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { env, isDevMode } from '../env.js';
import { AUTH0_NAMESPACE } from '@itatti/shared';

const ROLES_KEY = `${AUTH0_NAMESPACE}/roles`;
const CIVICRM_KEY = `${AUTH0_NAMESPACE}/civicrm_id`;

// Extend Express Request with our custom fields
declare global {
  namespace Express {
    interface Request {
      auth?: Record<string, unknown>;
      userRoles: string[];
      userId: string;
      civicrmId?: string;
    }
  }
}

// Dev mode: skip JWT, inject mock user
function devAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.auth = {
    sub: 'dev|12345',
    email: 'dev@itatti.harvard.edu',
    given_name: 'Dev',
    family_name: 'User',
    [ROLES_KEY]: ['fellows', 'fellows-current', 'fellows-admin', 'staff-it'],
    [CIVICRM_KEY]: '99999',
  } as Record<string, unknown>;
  next();
}

// Production: verify Auth0 JWT
const jwtMiddleware = expressjwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  }) as jwksRsa.GetVerificationKey,
  audience: env.AUTH0_AUDIENCE,
  issuer: `https://${env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});

export const authMiddleware = isDevMode ? devAuthMiddleware : jwtMiddleware;

// Extract user roles and civicrm_id from the JWT payload into req
export function extractUser(req: Request, _res: Response, next: NextFunction) {
  const auth = req.auth as Record<string, unknown> | undefined;
  req.userRoles = (auth?.[ROLES_KEY] as string[]) ?? [];
  req.userId = (auth?.sub as string) ?? '';
  req.civicrmId = auth?.[CIVICRM_KEY] as string | undefined;
  next();
}
