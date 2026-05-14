import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number(),

  DATABASE_URL: z.string(),

  // REDIS_URL: z.string(),
});

export const env = envSchema.parse(process.env);