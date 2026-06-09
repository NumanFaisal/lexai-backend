import prisma from '../../config/db';
import { QuerySource } from '@prisma/client';

export const saveVoiceTranscription = async (data: {
  userId: string;
  transcript: string;
  source: QuerySource;
  detectedLang?: string;
}) => {
  return await prisma.voiceTranscription.create({
    data: {
      userId: data.userId,
      transcript: data.transcript,
      source: data.source,
      detectedLang: data.detectedLang || 'hi', // Default to Hindi based on our Whisper config
      // Note: You can expand this later to save audioUrl, costUsd, duration, etc.
    },
  });
};

export const getUserVoiceTranscriptions = async (userId: string, limit: number = 20, skip: number = 0) => {
  return await prisma.voiceTranscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: skip,
    select: {
      id: true,
      transcript: true,
      detectedLang: true,
      source: true,
      createdAt: true,
      queryId: true, // Let the frontend know if this was attached to an actual AI query
    },
  });
};

export const countUserVoiceTranscriptions = async (userId: string) => {
  return await prisma.voiceTranscription.count({
    where: { userId },
  });
};