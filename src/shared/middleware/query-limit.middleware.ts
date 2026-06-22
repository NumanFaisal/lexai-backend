// src/shared/middleware/query-limit.middleware.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/db';
import { AppError } from '../errors/AppError';

export const enforceQueryLimit = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { queriesUsed: true, queriesLimit: true, plan: true }
    });

    if (!user) throw new AppError('User not found', 404);

    if (user.queriesUsed >= user.queriesLimit) {
      throw new AppError(
        `Monthly limit reached (${user.queriesLimit}/${user.queriesLimit}). Please upgrade your plan to continue using LexAI.`,
        402 // 402 Payment Required is standard for quota exhaustion
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};