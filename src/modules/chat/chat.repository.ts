import prisma from "@/config/db";
import { ConfidenceLevel } from '@prisma/client';

export const saveResearchQuery = async (data: {
  userId: string;
  inputText: string;
  response: string;
  confidenceScore: number;
  citationsRaw: any[];
  citationsVerified: any[];
}) => {
  let confidenceLevel: ConfidenceLevel = ConfidenceLevel.HIGH;
  if (data.confidenceScore < 0.5) confidenceLevel = ConfidenceLevel.LOW;
  else if (data.confidenceScore < 0.8) confidenceLevel = ConfidenceLevel.MEDIUM;

  return await prisma.query.create({
    data: {
      userId: data.userId,
      mode: "RESEARCH",
      inputText: data.inputText,
      response: data.response,
      confidence: data.confidenceScore,
      confidenceLevel: confidenceLevel,
      citationsRaw: data.citationsRaw || [],
      citationsVerified: data.citationsVerified || [],
      hallucinationFlagged: data.confidenceScore < 0.5,
      
      // 🔥 ADD THIS: Save individual records to the Citation table
      citations: {
        create: data.citationsVerified.map((c) => ({
          type: c.type || "OTHER",
          rawText: c.rawText,
          actName: c.actName,
          sectionNum: c.sectionNum,
          caseName: c.caseName,
          verified: c.verified,
          kanoonUrl: c.kanoonUrl,
        }))
      }
    },
  });
};


// Add this below your saveResearchQuery function

export const getUserHistory = async (userId: string, limit: number = 50) => {
  return await prisma.query.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' }, // Newest first
    take: limit, // Only grab the last 50 to keep it fast
    select: {
      id: true,
      inputText: true,
      response: true,
      confidenceLevel: true,
      citationsVerified: true,
      createdAt: true,
    }
  });
};

export const getConversationsList = async (userId: string, skip: number, take: number) => {
  return await prisma.conversation.findMany({
    where: { userId, isArchived: false },
    orderBy: { updatedAt: 'desc' },
    skip,
    take,
    select: {
      id: true,
      title: true,
      persona: true,
      mode: true,
      source: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const countConversations = async (userId: string) => {
  return await prisma.conversation.count({
    where: { userId, isArchived: false },
  });
};

export const getConversationById = async (id: string, userId: string) => {
  return await prisma.conversation.findFirst({
    where: { id, userId, isArchived: false },
    include: {
      queries: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
};