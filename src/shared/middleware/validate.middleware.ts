// src/shared/middleware/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { BadRequestError } from '../errors/AppError';

export const validate = (schema: ZodTypeAny) => 
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as any;
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) {
        Object.defineProperty(req, 'query', {
          value: parsed.query,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
      if (parsed.params) {
        Object.defineProperty(req, 'params', {
          value: parsed.params,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
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