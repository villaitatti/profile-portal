import type { Request, Response, NextFunction } from 'express';
import { hasAnyRole } from '@itatti/shared';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRoles || !hasAnyRole(req.userRoles, allowedRoles)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
