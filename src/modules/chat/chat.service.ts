import { SupportedModel } from '@/config/llm.config';
import { researchPipeline, runResearchPipeline } from '../../ai/pipelines/research.pipeline';
import { getUserHistory, saveResearchQuery } from './chat.repository';
import { redisClient } from '@/config/redis';

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