import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../errors/AppError';

// Add userId to the Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // 1. Get the token from the "Authorization: Bearer <token>" header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid token'));
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Verify the token using your secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { userId: string };
    
    // 3. Attach the user ID to the request so your Chat module can use it!
    req.auth = { userId: decoded.userId };
    
    next();
  } catch (error) {
    return next(new UnauthorizedError('Token is invalid or has expired'));
  }
};