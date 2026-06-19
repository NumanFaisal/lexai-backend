// src/infrastructure/caching/telemetry/analytics.ts
import { redisClient } from '../../../config/redis';

export class CacheAnalyticsEngine {
  /**
   * Calculates real-time efficiency percentages for specific caching keyspaces.
   */
  static async getCacheEfficiency(namespace: string): Promise<{ hitRate: number; totalQueries: number }> {
    const hits = parseInt(await redisClient.get(`metrics:v1:cache:${namespace}:hit`) || '0', 10);
    const misses = parseInt(await redisClient.get(`metrics:v1:cache:${namespace}:miss`) || '0', 10);
    const total = hits + misses;

    if (total === 0) return { hitRate: 100.0, totalQueries: 0 };
    return { hitRate: parseFloat(((hits / total) * 100).toFixed(2)), totalQueries: total };
  }
}