// src/shared/middleware/auth.middleware.ts
import { ClerkExpressRequireAuth, StrictAuthProp } from '@clerk/clerk-sdk-node';
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors/AppError';

declare global {
  namespace Express {
    interface Request extends StrictAuthProp {}
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // We wrap Clerk's middleware and intercept the error
  ClerkExpressRequireAuth()(req as any, res as any, (err: any) => {
    if (err) {
      return next(new UnauthorizedError('You must be logged in. Invalid or missing token.'));
    }
    next();
  });
};