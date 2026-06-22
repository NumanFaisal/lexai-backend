// src/shared/middleware/admin.middleware.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

// Ensure you add ADMIN_EMAILS="your@email.com,admin@lexai.in" to your .env
const ADMIN_EMAILS = (env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

export const requireAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      throw new AppError('Forbidden: Administrator access required.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};