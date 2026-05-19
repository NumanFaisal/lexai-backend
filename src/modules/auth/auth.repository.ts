// src/modules/auth/auth.repository.ts
import prisma from '../../config/db';
import { Persona, Plan, User } from '@prisma/client';

export const upsertUser = async (data: { clerkId: string, phone: string, email: string | null, name: string }): Promise<User> => {
  return await prisma.user.upsert({
    where: { clerkId: data.clerkId },
    update: { email: data.email, name: data.name },
    create: {
      clerkId: data.clerkId,
      phone: data.phone,
      email: data.email,
      name: data.name,
      persona: Persona.ADVOCATE,
      plan: Plan.FREE,
      queriesLimit: 30,
    },
  });
};

export const updatePersonaInDb = async (clerkId: string, persona: Persona): Promise<User> => {
  return await prisma.user.update({
    where: { clerkId },
    data: { persona },
  });
};