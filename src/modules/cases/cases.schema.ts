import { z } from 'zod';

const MODEL_ENUM = z.enum(['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash', 'gemini-1.5-pro']).optional().default('gemini-2.0-flash');

export const askCaseSchema = z.object({
  query: z.string().min(5),
  model: MODEL_ENUM,
});
