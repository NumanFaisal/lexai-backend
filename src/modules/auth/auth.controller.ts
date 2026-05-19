
import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { env } from '../../config/env';
import { syncUserToDatabase, updateUserPersona } from './auth.service';
import { BadRequestError } from '../../shared/errors/AppError';
import { Persona } from '@prisma/client';

export const handleClerkWebhook = async (req: Request, res: Response) => {
  const SIGNING_SECRET = env.CLERK_WEBHOOK_SECRET;
  if (!SIGNING_SECRET) throw new Error('Missing CLERK_WEBHOOK_SECRET');

  const svix_id = req.headers['svix-id'] as string;
  const svix_timestamp = req.headers['svix-timestamp'] as string;
  const svix_signature = req.headers['svix-signature'] as string;

  if (!svix_id || !svix_timestamp || !svix_signature) {
    throw new BadRequestError('Missing Svix signature headers');
  }

  const payload = req.body.toString('utf8');
  const wh = new Webhook(SIGNING_SECRET);
  let evt: any;

  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    throw new BadRequestError('Webhook signature verification failed');
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    await syncUserToDatabase(evt.data);
  }

  res.status(200).json({ success: true, message: 'Webhook processed' });
};

export const selectPersona = async (req: Request, res: Response) => {
  const clerkId = req.auth.userId; 
  // const clerkId = "fake_test_user_123";
  // We trust req.body.persona here because the Zod middleware validated it!
  const { persona } = req.body; 

  const updatedUser = await updateUserPersona(clerkId, persona as Persona);
  
  res.status(200).json({
    success: true,
    data: { persona: updatedUser.persona }
  });
};