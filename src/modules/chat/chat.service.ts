// src/modules/chat/chat.service.ts
import { SupportedModel } from '@/config/llm.config';
import { runResearchPipeline } from '../../ai/pipelines/research.pipeline';
import { caseAnalysisAgent } from '../../ai/agents/case-analysis/case-analysis.agent';
import { complianceAgent } from '../../ai/agents/compliance/compliance.agent';
import { draftingAgent } from '../../ai/agents/drafting/drafting.agent';
import { BusinessProfile } from '../../ai/pipelines/compliance.pipeline';
import { DraftingInput } from '../../ai/pipelines/drafting.pipeline';
import { getUserHistory, saveResearchQuery, getConversationsList, countConversations, getConversationById } from './chat.repository';
import { redisClient } from '@/config/redis';
import { AppError } from '../../shared/errors/AppError';
import prisma from '@/config/db';
import { FileExtractor } from '../../shared/utils/file-extractor';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import crypto from 'crypto';
import { WhisperProvider } from '../../ai/providers/whisper.provider';
import { saveVoiceTranscription } from '../voice/voice.repository';
import { QuerySource } from '@prisma/client';

// RESEARCH

// Utility: Ensure user exists (for auth sync or test scenarios)
const ensureUserExists = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError(
      `User with id ${userId} not found. Please check authentication.`,
      404
    );
  }

  return user;
};

export const processResearchQuery = async (userId: string, query: string, model: SupportedModel) => {
  console.log(`🧠 Starting AI Research for user ${userId} using ${model}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const result = await runResearchPipeline({
    query,
    userId,
    selectedModel: model,
  });

  const savedRecord = await saveResearchQuery({
    userId,
    inputText:         query,
    response:          result.finalResponse,
    confidenceScore:   result.confidenceScore,
    citationsRaw:      [],
    citationsVerified: result.citationsVerified,
  });

  // Cache invalidation — clear history cache so new query appears
  await redisClient.del(`history:${userId}`);

  return {
    queryId:         savedRecord.id,
    response:        result.finalResponse,
    confidenceScore: result.confidenceScore,
    confidenceLevel: result.confidenceLevel,
    citations:       result.citationsVerified,
  };
};

// CASE ANALYSIS

export const processCaseAnalysisQuery = async (
  userId: string,
  query:  string,
  model:  SupportedModel
) => {
  console.log(`⚖️ Starting Case Analysis for user ${userId} using ${model}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const result = await caseAnalysisAgent.run({ query, userId, model });

  await redisClient.del(`history:${userId}`);

  return {
    queryId:         result.queryId,
    response:        result.response,
    confidenceScore: result.confidenceScore,
    confidenceLevel: result.confidenceLevel,
    citations:       result.citations,
    precedentsFound: result.precedentsFound,
    latencyMs:       result.latencyMs,
    fromCache:       result.fromCache,
  };
};

// COMPLIANCE

export const processComplianceQuery = async (
  userId:          string,
  businessProfile: BusinessProfile,
  model:           SupportedModel
) => {
  console.log(`📋 Starting Compliance Check for user ${userId}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const result = await complianceAgent.run({ businessProfile, userId, model });

  await redisClient.del(`history:${userId}`);

  return {
    reportId:        result.reportId,
    title:           result.title,
    summary:         result.summary,
    items:           result.items,
    totalItems:      result.totalItems,
    urgentCount:     result.urgentCount,
    confidenceScore: result.confidenceScore,
    confidenceLevel: result.confidenceLevel,
    latencyMs:       result.latencyMs,
    fromCache:       result.fromCache,
  };
};

// DRAFTING

export const processDraftingQuery = async (
  userId:        string,
  draftingInput: DraftingInput & { saveDocument?: boolean },
  model:         SupportedModel
) => {
  console.log(`📄 Starting Drafting for user ${userId} — ${draftingInput.documentType}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const { saveDocument = true, ...input } = draftingInput;

  const result = await draftingAgent.run({
    draftingInput: input,
    userId,
    model,
    saveDocument,
  });

  await redisClient.del(`history:${userId}`);

  return {
    queryId:          result.queryId,
    documentId:       result.documentId,
    pdfUrl:           result.pdfUrl,
    pdfDownloadUrl:   result.pdfDownloadUrl,
    content:          result.content,
    documentType:     result.documentType,
    structureValid:   result.structureValid,
    missingStructure: result.missingStructure,
    confidenceScore:  result.confidenceScore,
    confidenceLevel:  result.confidenceLevel,
    latencyMs:        result.latencyMs,
    fromCache:        result.fromCache,
  };
};

export const processDraftingEdit = async (userId: string, file: Express.Multer.File, instruction: string, model: SupportedModel) => {
  console.log(`📄 Starting Drafting Edit for user ${userId}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  // 1. Extract text from uploaded file
  const extractedText = await FileExtractor.extractText(file.buffer, file.mimetype, file.originalname);
  
  // 2. Check Word Limit
  const wordCount = extractedText.split(/\s+/).length;
  
  // Get today's usage log
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let usageLog = await prisma.usageLog.findUnique({
    where: { userId_date: { userId, date: today } }
  });
  
  if (!usageLog) {
    usageLog = await prisma.usageLog.create({
      data: { userId, date: today }
    });
  }
  
  const DAILY_WORD_LIMIT = 20000; // E.g., 20,000 words max per day
  
  if (usageLog.draftingWordsUsed + wordCount > DAILY_WORD_LIMIT) {
    throw new AppError(`Daily drafting word limit exceeded. You have used ${usageLog.draftingWordsUsed}/${DAILY_WORD_LIMIT} words today. Please wait for tomorrow.`, 429);
  }

  // Increment usage
  await prisma.usageLog.update({
    where: { id: usageLog.id },
    data: { draftingWordsUsed: { increment: wordCount } }
  });

  // 3. Upload file to R2 for safekeeping (optional)
  const r2Key = `cases/${userId}/${Date.now()}_${file.originalname}`;
  await r2Storage.uploadFile(r2Key, file.buffer, file.mimetype);

  // 4. Send to agent (simulate passing extracted text as context)
  const result = await draftingAgent.run({
    draftingInput: {
      documentType: 'Custom Edit',
      parties: [],
      jurisdiction: 'India',
      context: `ORIGINAL DOCUMENT TEXT:\n${extractedText}\n\nUSER INSTRUCTION:\n${instruction}`
    },
    userId,
    model,
    saveDocument: true,
  });

  await redisClient.del(`history:${userId}`);

  return {
    documentId:       result.documentId,
    content:          result.content,
    wordsProcessed:   wordCount,
    dailyWordsUsed:   usageLog.draftingWordsUsed + wordCount,
  };
};

// HISTORY & CONVERSATIONS (unchanged)

export const fetchUserChatHistory = async (userId: string) => {
  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const cacheKey = `history:${userId}`;

  const cachedHistory = await redisClient.get(cacheKey);
  if (cachedHistory) {
    console.log(`⚡ Serving history for ${userId} from Redis Cache`);
    return JSON.parse(cachedHistory);
  }

  console.log(`🗄️ Fetching history for ${userId} from Database`);
  const history = await getUserHistory(userId);

  await redisClient.set(cacheKey, JSON.stringify(history), 'EX', 3600);

  return history;
};

export const fetchUserConversations = async (userId: string, page: number = 1, limit: number = 20) => {
  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const skip = (page - 1) * limit;
  let conversations = await getConversationsList(userId, skip, limit);
  let total = await countConversations(userId);

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
        id:         q.id,
        userId,
        title:      q.inputText.split('\n')[0].substring(0, 60),
        persona:    'ADVOCATE',
        mode:       q.mode,
        source:     q.source,
        isArchived: false,
        createdAt:  q.createdAt,
        updatedAt:  q.createdAt,
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
  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const conversation = await getConversationById(conversationId, userId);
  if (conversation) return conversation;

  const query = await prisma.query.findFirst({
    where: { id: conversationId, userId }
  });

  if (query) {
    return {
      id:         query.id,
      userId:     query.userId,
      title:      query.inputText.split('\n')[0].substring(0, 60),
      persona:    'ADVOCATE',
      mode:       query.mode,
      source:     query.source,
      isArchived: false,
      createdAt:  query.createdAt,
      updatedAt:  query.createdAt,
      queries:    [query],
    };
  }

  throw new AppError('Conversation not found', 404);
};


// VOICE INPUT (WHISPER STT)

export const processVoiceInput = async (userId: string,  audioBuffer: Buffer, filename: string, mimetype: string) => {

  console.log(`Processing Hindi Voice Input for user ${userId}`);
  await ensureUserExists(userId);

  // 1. Generate SHA-256 hash of the audio buffer for the redis key
  const audioHash = crypto.createHash('sha256').update(audioBuffer).digest('hex');
  const cacheKey = `voice:stt:hi:${audioHash}`;

  // 2. Check Redis cache
  const cachedTranscription = await redisClient.get(cacheKey);
  if (cachedTranscription) {
    // Save record to DB for user history, even if served from cache
    await saveVoiceTranscription({
      userId,
      transcript: cachedTranscription,
      source: QuerySource.WEB,
      detectedLang: 'hi'
    });
    return { text: cachedTranscription, fromCache: true };
  }

  // 3. call Whisper provider if not in cache
  const transcribedText = await WhisperProvider.transcribeHindiAudio(audioBuffer, filename, mimetype);

  // 4. save to Redis Cache for 24 hours to save API costs on retries
  if (transcribedText) {
    await redisClient.setex(cacheKey, 86400, transcribedText); 
    
    // Save to your actual VoiceTranscription table
    await saveVoiceTranscription({
      userId,
      transcript: transcribedText,
      source: QuerySource.WEB,
      detectedLang: 'hi'
    });
  }

  return { text: transcribedText, fromCache: false };

};