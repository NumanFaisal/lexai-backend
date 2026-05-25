// src/shared/middleware/rate-limit.middleware.ts
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../../config/redis';

// 1. Strict Limiter for AI Generation (e.g., 10 queries per minute)
export const aiRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: any[]) => redisClient.call(...args) as Promise<any>,
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 AI queries per minute per user
  message: { 
    success: false, 
    error: 'You are asking questions too quickly. Please wait a minute before trying again.' 
  },
  // Group limits by the user's Clerk ID instead of IP address
  keyGenerator: (req) => `rl:ai:${req.auth.userId}`,
});

// 2. Standard Limiter for general APIs like Chat History (e.g., 60 per minute)
export const apiRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args) as Promise<any>,
  }),
  windowMs: 60 * 1000, 
  max: 60, 
  message: { success: false, error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => `rl:api:${req.auth.userId}`,
});