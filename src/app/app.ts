import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env';
import { errorHandler } from '../shared/errors/error.handler';
import { NotFoundError } from '../shared/errors/AppError';

import authRoutes from '../modules/auth/auth.routes';

import chatRoutes from '../modules/chat/chat.routes';

const app = express();

/*
|--------------------------------------------------------------------------
| Security Middlewares
|--------------------------------------------------------------------------
*/

app.use(helmet());

app.use(cors());


// Mount auth routes FIRST
app.use('/api/v1/auth', authRoutes);

/*
|--------------------------------------------------------------------------
| Body Parsers
|--------------------------------------------------------------------------
*/

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| Performance Middlewares
|--------------------------------------------------------------------------
*/

app.use(compression());

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/




app.get('/api/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'LexAI backend running',
    environment: env.NODE_ENV 
  });
});

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/chat', chatRoutes);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl} not found`));
});

/*
|--------------------------------------------------------------------------
| Global Error Middleware
|--------------------------------------------------------------------------
*/

// app.use(errorMiddleware);
// The global error handler MUST be the very last middleware
app.use(errorHandler);

export default app;