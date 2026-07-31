// src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';

let isRedisConnected = false;

// We export a single instance to be used across the whole app
export const redisClient = new Redis(env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    if (times > 3) {
      return null; // Stop endlessly spamming retries if Redis is offline
    }
    return Math.min(times * 1000, 3000);
  },
});

redisClient.on('connect', () => {
  if (!isRedisConnected) {
    console.log('✅ Redis connected successfully');
    isRedisConnected = true;
  }
});

redisClient.on('error', (err) => {
  if (isRedisConnected) {
    console.warn('⚠️ Redis connection lost:', err.message);
    isRedisConnected = false;
  }
});