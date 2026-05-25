// src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';

// We export a single instance to be used across the whole app
export const redisClient = new Redis(env.UPSTASH_REDIS_URL);

redisClient.on('error', (err) => console.error('Redis Client Error', err));