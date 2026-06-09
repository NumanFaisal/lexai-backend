import { z } from 'zod';

const MODEL_ENUM = z.enum(['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash', 'gemini-1.5-pro']).optional().default('gpt-4o');

export const analyzeCaseSchema = z.object({
  body: z.object({
    message: z.string().min(10, 'Please describe the case in more detail.').max(10_000),
    model:   MODEL_ENUM,
    caseId:  z.string().cuid().optional(),
  }),
});
