import { env } from '@/config/env';
import { logger } from '@/config/logger';
import app from './app';

// Initialize background queue workers
import '@/modules/workers/compliance.worker';
import '@/modules/workers/voice.worker';



const PORT = env.PORT;

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/

const shutdown = async (): Promise<void> => {
  logger.info('Shutting down server...');

  server.close(() => {
    logger.info('HTTP server closed');

    process.exit(0);
  });
};

process.on('SIGINT', shutdown);

process.on('SIGTERM', shutdown);

/*
|--------------------------------------------------------------------------
| Unhandled Errors
|--------------------------------------------------------------------------
*/

process.on('unhandledRejection', (reason) => {
  logger.error(reason);

  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error(error);

  process.exit(1);
});