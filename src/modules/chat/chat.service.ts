import { SupportedModel } from '@/config/llm.config';
import { researchPipeline } from '../../ai/pipelines/research.pipeline';
import { getUserHistory, saveResearchQuery } from './chat.repository';
import { redisClient } from '@/config/redis';

export const processResearchQuery = async (userId: string, query: string, model: SupportedModel) => {
  console.log(`🧠 Starting AI Research for user ${userId} using ${model}...`);
  
  // 1. Trigger the LangGraph AI Pipeline
  const finalState = await researchPipeline.invoke({
    query: query,
    selectedModel: model
  });

  // 2. Save the results to PostgreSQL
  const savedRecord = await saveResearchQuery({
    userId: userId,
    inputText: query,
    response: finalState.finalResponse || "Error generating response.",
    confidenceScore: finalState.confidenceScore || 1.0, // Default to 1.0 if no citations were needed
    citationsRaw: finalState.citationsRaw,
    citationsVerified: finalState.citationsVerified
  });

  // 🔥 CACHE INVALIDATION: 
  // Delete the old history cache so the frontend gets this new message next time
  await redisClient.del(`history:${userId}`);

  // 3. Return the clean data to the controller
  return {
    queryId: savedRecord.id,
    response: finalState.finalResponse,
    confidenceScore: finalState.confidenceScore,
    citations: finalState.citationsVerified,
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