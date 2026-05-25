import { z } from 'zod';


export const researchChatSchema = z.object({
  body: z.object({
    message: z.string().min(2, "Message must be at least 2 characters long."),
    // Optional model selector, defaults to Claude if the frontend doesn't send it
    model: z.enum(['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash', 'llama-3.1-8b-instant']).optional().default('gemini-2.0-flash'),
  }),
})