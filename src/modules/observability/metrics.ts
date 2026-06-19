// src/modules/observability/metrics.ts
import { redisClient } from '../../config/redis';
import { logger } from '../../config/logger';

export class EngineMetrics {
  private static readonly PREFIX = 'metrics:v1:';

  /**
   * Atomic incremental tracking across system telemetry performance categories.
   */
  static async increment(metricKey: string, value: number = 1): Promise<void> {
    try {
      const key = `${this.PREFIX}${metricKey}`;
      await redisClient.incrby(key, value);
    } catch (err) {
      logger.warn({ msg: 'Metrics incremental capture degraded', key: metricKey, error: (err as Error).message });
    }
  }

  /**
   * Log real-time operation performance timings via an atomic sliding latency registry.
   */
  static async recordLatency(metricKey: string, latencyMs: number): Promise<void> {
    try {
      const key = `${this.PREFIX}latency:${metricKey}`;
      await redisClient.lpush(key, latencyMs.toString());
      await redisClient.ltrim(key, 0, 99); // Retain a sliding window of the last 100 observations
    } catch (err) {
      logger.warn({ msg: 'Failed to write latency log matrix into Redis', metricKey });
    }
  }

  /**
   * Retrieves summary performance timings from the cache.
   */
  static async getMetricsSummary(metricKey: string): Promise<{ totalCount: number; averageLatency: number }> {
    try {
      const count = await redisClient.get(`${this.PREFIX}${metricKey}`) || '0';
      const latencies = await redisClient.lrange(`${this.PREFIX}latency:${metricKey}`, 0, -1);
      
      const avgLatency = latencies.length > 0 
        ? latencies.reduce((acc, curr) => acc + parseFloat(curr), 0) / latencies.length 
        : 0;

      return { totalCount: parseInt(count, 10), averageLatency: parseFloat(avgLatency.toFixed(2)) };
    } catch (err) {
      return { totalCount: 0, averageLatency: 0 };
    }
  }
}