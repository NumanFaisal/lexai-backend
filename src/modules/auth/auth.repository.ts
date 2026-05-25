// src/modules/auth/auth.repository.ts
import prisma from '../../config/db';
import { Persona, Plan, User } from '@prisma/client';

export const createUser = async (data: { 
  email: string; 
  passwordHash: string; 
  name: string; 
  persona: Persona 
}): Promise<User> => {
  return await prisma.user.create({
    data: {
      email: data.email,
      password: data.passwordHash,
      name: data.name,
      persona: data.persona,
      plan: Plan.FREE,
      queriesLimit: 30,
      // phone is required by Prisma's UserCreateInput; provide empty string when not available
      phone: '',
    },
  });
};

export const updatePersonaInDb = async (userId: string, persona: Persona): Promise<User> => {
  return await prisma.user.update({
    where: { id: userId },
    data: { persona },
  });
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { email },
  });
};

export const findUserById = async (id: string): Promise<User | null> => {
  return await prisma.user.findUnique({
    where: { id },
  });
};