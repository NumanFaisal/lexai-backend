// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string(),
  // DIRECT_URL: z.string(),
  // FRONTEND_URL: z.string().url(),

  JWT_SECRET: z.string().default('fallback_secret'),

  // Ai model API keys
  ANTHROPIC_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  GOOGLE_API_KEY: z.string(),

  // Redis (Upstash) URL
  UPSTASH_REDIS_URL: z.string(),

  // Kanoon API key
  INDIAN_KANOON_API_KEY: z.string(),


  // R2 Storage (Cloudflare) credentials
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),

  // Twilio Configuration
  TWILIO_ACCOUNT_SID: z.string(),
  TWILIO_AUTH_TOKEN: z.string(),

  // Add other keys here as you need them (Razorpay, Twilio, etc.)
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;