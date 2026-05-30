import { SupportedModel } from '@/config/llm.config';
import { researchPipeline, runResearchPipeline } from '../../ai/pipelines/research.pipeline';
import { getUserHistory, saveResearchQuery, getConversationsList, countConversations, getConversationById } from './chat.repository';
import { redisClient } from '@/config/redis';
import { AppError } from '../../shared/errors/AppError';
import prisma from '@/config/db';

export const processResearchQuery = async (userId: string, query: string, model: SupportedModel) => {
  console.log(`🧠 Starting AI Research for user ${userId} using ${model}...`);
  
  console.log(`🧠 Starting AI Research for user ${userId} using ${model}...`);
  
  // 1. Trigger the LangGraph Wrapper Function
  const result = await runResearchPipeline({
    query: query,
    userId: userId,
    selectedModel: model
    // Note: You can pass conversationHistory here once you fetch it from the DB
  });

  // 2. Save the results to PostgreSQL
  const savedRecord = await saveResearchQuery({
    userId: userId,
    inputText: query,
    response: result.finalResponse,
    confidenceScore: result.confidenceScore,
    citationsRaw: [], // You can omit this or return it from the wrapper if needed for debugging
    citationsVerified: result.citationsVerified
  });

  // 🔥 CACHE INVALIDATION: 
  await redisClient.del(`history:${userId}`);

  // 3. Return the clean data to the controller
  return {
    queryId: savedRecord.id,
    response: result.finalResponse,
    confidenceScore: result.confidenceScore,
    citations: result.citationsVerified,
  };
};



export const fetchUserChatHistory = async (userId: string) => {
  const cacheKey = `history:${userId}`;

  // 1. Check Redis Cache First
  const cachedHistory = await redisClient.get(cacheKey);
  if (cachedHistory) {
    console.log(`⚡ Serving history for ${userId} from Redis Cache`);
    return JSON.parse(cachedHistory);
  }

  // 2. If not in cache, fetch from PostgreSQL
  console.log(`🗄️ Fetching history for ${userId} from Database`);
  const history = await getUserHistory(userId);
  
  // 3. Save to Redis Cache for 1 hour (3600 seconds)
  await redisClient.set(cacheKey, JSON.stringify(history), 'EX', 3600);

  return history;
};

export const fetchUserConversations = async (userId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  let conversations = await getConversationsList(userId, skip, limit);
  let total = await countConversations(userId);

  // Fallback: If no actual conversations exist, check for queries without a conversation
  if (total === 0) {
    const legacyQueries = await prisma.query.findMany({
      where: { userId, conversationId: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        inputText: true,
        mode: true,
        source: true,
        createdAt: true,
      }
    });

    const totalLegacy = await prisma.query.count({
      where: { userId, conversationId: null }
    });

    if (totalLegacy > 0) {
      conversations = legacyQueries.map(q => ({
        id: q.id, // Using query ID as virtual conversation ID
        userId,
        title: q.inputText.split('\n')[0].substring(0, 60),
        persona: "ADVOCATE",
        mode: q.mode,
        source: q.source,
        isArchived: false,
        createdAt: q.createdAt,
        updatedAt: q.createdAt
      })) as any;
      total = totalLegacy;
    }
  }

  return {
    conversations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const fetchConversationDetails = async (userId: string, conversationId: string) => {
  const conversation = await getConversationById(conversationId, userId);
  if (conversation) {
    return conversation;
  }

  // Fallback: If not found, check if this is a legacy query ID
  const query = await prisma.query.findFirst({
    where: { id: conversationId, userId }
  });

  if (query) {
    return {
      id: query.id,
      userId: query.userId,
      title: query.inputText.split('\n')[0].substring(0, 60),
      persona: "ADVOCATE",
      mode: query.mode,
      source: query.source,
      isArchived: false,
      createdAt: query.createdAt,
      updatedAt: query.createdAt,
      queries: [query]
    };
  }

  throw new AppError('Conversation not found', 404);
};