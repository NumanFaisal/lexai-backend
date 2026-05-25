import prisma from "@/config/db";
import { QueryMode, ConfidenceLevel } from '@prisma/client';

export const saveResearchQuery = async (data: {
  userId: string;
  inputText: string;
  response: string;
  confidenceScore: number;
  citationsRaw: any;
  citationsVerified: any;
}) => {
  let confidenceLevel: ConfidenceLevel = ConfidenceLevel.HIGH;
  if (data.confidenceScore < 0.5) confidenceLevel = ConfidenceLevel.LOW;
  else if (data.confidenceScore < 0.8) confidenceLevel = ConfidenceLevel.MEDIUM;

  // 🔥 ADD THIS EXACT LINE:
  console.log("🚨 HEY SERVER, I AM RUNNING THE NEW CODE WITH MODE:", QueryMode.RESEARCH);

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