import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

const app = express();

/*
|--------------------------------------------------------------------------
| Security Middlewares
|--------------------------------------------------------------------------
*/

app.use(helmet());

app.use(cors());

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

app.get('/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'LexAI backend running',
  });
});

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// app.use('/api/v1/auth', authRoutes);

// app.use('/api/v1/chat', chatRoutes);

// app.use('/api/v1/documents', documentRoutes);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Middleware
|--------------------------------------------------------------------------
*/

// app.use(errorMiddleware);

export default app;