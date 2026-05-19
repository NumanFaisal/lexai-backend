// src/modules/auth/auth.service.ts
import { Persona } from '@prisma/client';
import { upsertUser, updatePersonaInDb } from './auth.repository';

export const syncUserToDatabase = async (clerkData: any) => {
  const { id, first_name, last_name, email_addresses, phone_numbers } = clerkData;
  
  const phone = phone_numbers?.[0]?.phone_number || '';
  const email = email_addresses?.[0]?.email_address || null;
  const name = `${first_name || ''} ${last_name || ''}`.trim() || 'User';

  return await upsertUser({ clerkId: id, phone, email, name });
};

export const updateUserPersona = async (clerkId: string, persona: Persona) => {
  return await updatePersonaInDb(clerkId, persona);
};