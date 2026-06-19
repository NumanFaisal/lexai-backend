// src/infrastructure/caching/telemetry/sentry.ts
import { logger } from '../../../config/logger';
import { env } from '../../../config/env';

export class FallbackTelemetrySentry {
  /**
   * Captures runtime execution hazards and routes them into the centralized logger.
   */
  static captureException(error: Error, contexts?: Record<string, any>): void {
    logger.error({
      msg: '🚨 [Telemetry Exception Captured]',
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
      environment: env.NODE_ENV,
      ...contexts
    });
    
    // Extensible Hook: Integrate official @sentry/node initialization drivers here if required.
  }

  /**
   * Appends execution trail metrics into logging tracking matrices.
   */
  static addBreadcrumb(message: string, category: string = 'app', level: 'info' | 'warn' | 'error' = 'info'): void {
    logger.info({ msg: `[Telemetry Breadcrumb] [${category}] ${message}`, level });
  }
}