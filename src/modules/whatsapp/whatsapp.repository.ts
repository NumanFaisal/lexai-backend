// src/modules/whatsapp/whatsapp.repository.ts
import prisma from '../../config/db';
import { WhatsappSessionState } from '@prisma/client';

export class WhatsappRepository {
  static async getOrCreateSession(phone: string) {
    let session = await prisma.whatsappSession.findUnique({
      where: { phone },
      include: { user: true },
    });

    if (!session) {
      session = await prisma.whatsappSession.create({
        data: {
          phone,
          state: 'IDLE',
          contextMessages: [],
        },
        include: { user: true },
      });
    }

    return session
  }


  static async updateSessionContext(phone: string, contextMessages: any[], incrementQuery: boolean = false) {
    return await prisma.whatsappSession.update({
      where: { phone },
      data: {
        contextMessages,
        lastMessageAt: new Date(),
        ...(incrementQuery && {
          totalQueries: { increment: 1 },
          queriesThisMonth: { increment: 1 }
        })
      },
    });
  }


  static async setSessionState(phone: string, state: WhatsappSessionState) {
    return await prisma.whatsappSession.update({
      where: { phone },
      data: { state },
    });
  }

  static async linkUserToWhatsApp(userId: string, phone: string) {
    // Transaction to ensure both user and session are updated safely
    return await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { whatsappLinked: true, whatsappPhone: phone },
      }),
      prisma.whatsappSession.upsert({
        where: { phone },
        update: { userId },
        create: { phone, userId, state: 'IDLE', contextMessages: [] },
      }),
    ]);
  }

  static async unlinkWhatsApp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.whatsappPhone) return null;

    return await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { whatsappLinked: false, whatsappPhone: null },
      }),
      prisma.whatsappSession.update({
        where: { phone: user.whatsappPhone },
        data: { userId: null },
      }),
    ]);
  }

  

}