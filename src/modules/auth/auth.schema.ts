// src/modules/auth/auth.schema.ts
import { z } from 'zod';
import { Persona } from '@prisma/client';

// 1. Validate Custom Sign Up
export const signupSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters long.'),
    username: z.string().min(2, 'Username is required.'),
    persona: z.nativeEnum(Persona, {
      error: 'Invalid Persona. Must be ADVOCATE, BUSINESS, or STUDENT.',
    }).optional().default(Persona.ADVOCATE),
  }),
});

// 2. Validate Custom Sign In
export const signinSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address.'),
    password: z.string().min(1, 'Password is required.'),
  }),
});

// 3. Keep your existing Persona update schema
export const selectPersonaSchema = z.object({
  body: z.object({
    persona: z.nativeEnum(Persona, {
      error: 'Invalid Persona. Must be ADVOCATE, BUSINESS, or STUDENT.',
    }),
  }),
});