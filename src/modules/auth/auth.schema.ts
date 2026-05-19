// src/modules/auth/auth.schema.ts
import { z } from 'zod';
import { Persona } from '@prisma/client';

export const selectPersonaSchema = z.object({
  body: z.object({
    persona: z.nativeEnum(Persona, {
      error: 'Invalid Persona. Must be ADVOCATE, BUSINESS, or STUDENT.',
    }),
  }),
});