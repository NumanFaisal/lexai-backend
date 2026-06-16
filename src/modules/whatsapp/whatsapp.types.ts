// src/modules/whatsapp/whatsapp.types.ts

import { WhatsappSessionState } from "@prisma/client";

export interface TwilioWebhookBody {
  SmsMessageSid: string;
  NumMedia: string;
  ProfileName: string;
  SmsSid: string;
  WaId: string;
  SmsStatus: string;
  Body: string;
  To: string;
  NumSegments: string;
  MessageSid: string;
  AccountSid: string;
  From: string;
  ApiVersion: string;
}


export interface LinkWhatsAppInput {
  phone: string;
}

export interface WhatsAppStatusResponse {
  isLinked: boolean;
  phone?: string;
  totalQueries?: number;
  queriesThisMonth?: number;
  state?: WhatsappSessionState;
}