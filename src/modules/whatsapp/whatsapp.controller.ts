// src/modules/whatsapp/whatsapp.controller.ts
import { Request, Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { WhatsappRepository } from './whatsapp.repository';
import { AppError } from '../../shared/errors/AppError';
import { LinkWhatsAppInput } from './whatsapp.types';
import prisma from '../../config/db';

// WEBHOOK (Called by Twilio)

export const handleTwilioWebhook = async (req: Request, res: Response) => {
  // Twilio webhooks are fire-and-forget. We return 200 OK immediately 
  // so Twilio doesn't retry, and process the AI request asynchronously.
  res.status(200).send('<Response></Response>');

  try {
    await WhatsappService.processIncomingMessage(req.body);
  } catch (error) {
    // Errors are logged in the service, do not crash the webhook handler
  }
};

// FRONTEND APIs (Called by Web Dashboard)

export const getWhatsAppStatus = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { whatsappSession: true }
  });

  if (!user) throw new AppError('User not found', 404);

  if (!user.whatsappLinked || !user.whatsappSession) {
    return res.status(200).json({
      success: true,
      data: { isLinked: false }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      isLinked: true,
      phone: user.whatsappPhone,
      totalQueries: user.whatsappSession.totalQueries,
      queriesThisMonth: user.whatsappSession.queriesThisMonth,
      state: user.whatsappSession.state
    }
  });
};

export const linkWhatsApp = async (req: Request<unknown, unknown, LinkWhatsAppInput>, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  const { phone } = req.body;
  if (!phone || !/^\+91\d{10}$/.test(phone)) {
    throw new AppError('Invalid phone number format. Must be +91XXXXXXXXXX', 400);
  }

  // Check if this number is already linked to another account
  const existingUser = await prisma.user.findFirst({
    where: { whatsappPhone: phone, id: { not: userId } }
  });

  if (existingUser) {
    throw new AppError('This WhatsApp number is already linked to another account.', 409);
  }

  await WhatsappRepository.linkUserToWhatsApp(userId, phone);

  res.status(200).json({
    success: true,
    message: 'WhatsApp number linked successfully. You can now chat with LexAI via WhatsApp.'
  });
};

export const unlinkWhatsApp = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  await WhatsappRepository.unlinkWhatsApp(userId);

  res.status(200).json({
    success: true,
    message: 'WhatsApp number unlinked successfully.'
  });
};