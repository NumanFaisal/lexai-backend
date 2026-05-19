// src/shared/errors/error.handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';
import { env } from '../../config/env';

export const errorHandler = (
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log the error for your own debugging
  console.error(`[Error] ${statusCode} - ${err.message}`);
  if (env.NODE_ENV === 'development' && !((err as AppError).isOperational)) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};