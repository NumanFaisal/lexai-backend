// src/shared/middleware/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { BadRequestError } from '../errors/AppError';

export const validate = (schema: ZodTypeAny) => 
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Formats Zod errors into a readable string
        const errorMessage = error.issues.map(e => e.message).join(', ');
        return next(new BadRequestError(`Validation failed: ${errorMessage}`));
      }
      
    return next(error);
  }
};