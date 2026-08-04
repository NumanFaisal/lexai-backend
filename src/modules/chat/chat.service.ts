// src/modules/chat/chat.service.ts
import { SupportedModel } from '@/config/llm.config';
import { runResearchPipeline } from '../../ai/pipelines/research.pipeline';
import { caseAnalysisAgent } from '../../ai/agents/case-analysis/case-analysis.agent';
import { complianceAgent } from '../../ai/agents/compliance/compliance.agent';
import { draftingAgent } from '../../ai/agents/drafting/drafting.agent';
import { BusinessProfile } from '../../ai/pipelines/compliance.pipeline';
import { DraftingInput } from '../../ai/pipelines/drafting.pipeline';
import { getUserHistory, saveResearchQuery, getConversationsList, countConversations, getConversationById, deleteConversationById } from './chat.repository';

import { redisClient } from '@/config/redis';
import { AppError } from '../../shared/errors/AppError';
import prisma from '@/config/db';
import { FileExtractor } from '../../shared/utils/file-extractor';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import crypto from 'crypto';
import { WhisperProvider } from '../../ai/providers/whisper.provider';
import { saveVoiceTranscription } from '../voice/voice.repository';
import { QuerySource } from '@prisma/client';
import { GroqProvider } from '../../ai/providers/groq.provider';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

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

export const ensureConversationWithTitle = async (
  userId: string,
  mode: 'RESEARCH' | 'DRAFT' | 'COMPLIANCE' | 'CASE_ANALYSIS',
  prompt: string,
  conversationId?: string
): Promise<string> => {
  if (conversationId && !conversationId.startsWith('temp_')) {
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (existing) {
      if (!existing.title || existing.title.length > 45) {
        GroqProvider.generateTitle(prompt).then((title) => {
          prisma.conversation.update({
            where: { id: conversationId },
            data: { title, updatedAt: new Date() },
          }).catch((err) => console.error('Failed async title update:', err));
        });
      }
      return conversationId;
    }
  }

  const fallbackTitle =
    prompt.trim().split('\n')[0].substring(0, 35) +
    (prompt.length > 35 ? '...' : '');

  const newConv = await prisma.conversation.create({
    data: {
      userId,
      title: fallbackTitle,
      persona: 'ADVOCATE',
      mode,
      source: 'WEB',
    },
  });

  // Generate high-quality AI title in background without blocking prompt execution
  GroqProvider.generateTitle(prompt).then((aiTitle) => {
    if (aiTitle && aiTitle !== fallbackTitle) {
      prisma.conversation.update({
        where: { id: newConv.id },
        data: { title: aiTitle },
      }).catch((err) => console.error('Failed async title update:', err));
    }
  }).catch(() => {});

  return newConv.id;
};

const normalizeCacheKey = (model: string, query: string) => {
  const cleanQuery = query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
  return `cache:research:${model.toLowerCase()}:${cleanQuery}`;
};

export const processResearchQuery = async (
  userId: string,
  query: string,
  model: SupportedModel,
  conversationId?: string
) => {
  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const cacheKey = normalizeCacheKey(model, query);

  // 1. Check Redis Cache first BEFORE calling LLM pipeline
  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`⚡ [Redis Cache HIT] Returning cached response instantly for query: "${query}"`);
      const parsed = JSON.parse(cachedData);

      const targetConvId = await ensureConversationWithTitle(userId, 'RESEARCH', query, conversationId);

      const savedRecord = await saveResearchQuery({
        userId,
        inputText:         query,
        response:          parsed.response,
        confidenceScore:   parsed.confidenceScore ?? 1.0,
        citationsRaw:      [],
        citationsVerified: parsed.citations ?? [],
        conversationId:    targetConvId,
      });

      await redisClient.del(`history:${userId}`);

      return {
        queryId:         savedRecord.id,
        conversationId:  targetConvId,
        response:        parsed.response,
        confidenceScore: parsed.confidenceScore ?? 1.0,
        confidenceLevel: parsed.confidenceLevel ?? 'HIGH',
        citations:       parsed.citations ?? [],
        fromCache:       true,
      };
    }
  } catch (err) {
    console.warn('⚠️ Redis cache read error:', err);
  }

  // 2. Cache Miss → Call LLM pipeline with conversational history
  console.log(`🧠 [Redis Cache MISS] Calling LLM pipeline for user ${userId} using ${model}...`);

  const targetConvId = await ensureConversationWithTitle(userId, 'RESEARCH', query, conversationId);

  // Fetch previous messages in this conversation to provide multi-turn context memory
  let conversationHistory: BaseMessage[] = [];
  if (targetConvId) {
    const pastQueries = await prisma.query.findMany({
      where: { conversationId: targetConvId, userId },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { inputText: true, response: true },
    });

    conversationHistory = pastQueries.flatMap((q) => [
      new HumanMessage(q.inputText),
      new AIMessage(q.response),
    ]);
  }

  const result = await runResearchPipeline({
    query,
    userId,
    selectedModel: model,
    conversationHistory,
  });

  const savedRecord = await saveResearchQuery({
    userId,
    inputText:         query,
    response:          result.finalResponse,
    confidenceScore:   result.confidenceScore,
    citationsRaw:      [],
    citationsVerified: result.citationsVerified,
    conversationId:    targetConvId,
  });

  const responsePayload = {
    queryId:         savedRecord.id,
    conversationId:  targetConvId,
    response:        result.finalResponse,
    confidenceScore: result.confidenceScore,
    confidenceLevel: result.confidenceLevel,
    citations:       result.citationsVerified,
  };

  // 3. Save to Redis Cache (24 hour TTL)
  try {
    await redisClient.setex(cacheKey, 86400, JSON.stringify(responsePayload));
    console.log(`💾 [Redis Cache SAVE] Cached AI response for key: ${cacheKey}`);
  } catch (err) {
    console.warn('⚠️ Redis cache write error:', err);
  }

  // Cache invalidation — clear history cache so new query appears
  await redisClient.del(`history:${userId}`);

  return responsePayload;
};

// CASE ANALYSIS

export const processCaseAnalysisQuery = async (
  userId: string,
  query:  string,
  model:  SupportedModel,
  conversationId?: string
) => {
  console.log(`⚖️ Starting Case Analysis for user ${userId} using ${model}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const targetConvId = await ensureConversationWithTitle(userId, 'CASE_ANALYSIS', query, conversationId);

  let conversationHistory: BaseMessage[] = [];
  if (targetConvId) {
    const pastQueries = await prisma.query.findMany({
      where: { conversationId: targetConvId, userId },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { inputText: true, response: true },
    });

    conversationHistory = pastQueries.flatMap((q) => [
      new HumanMessage(q.inputText),
      new AIMessage(q.response),
    ]);
  }

  const result = await caseAnalysisAgent.run({ query, userId, model, conversationHistory, conversationId: targetConvId });

  await redisClient.del(`history:${userId}`);

  return {
    queryId:         result.queryId,
    conversationId:  targetConvId,
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
  model:           SupportedModel,
  conversationId?: string
) => {
  console.log(`📋 Starting Compliance Check for user ${userId}...`);

  // Verify user exists before proceeding
  await ensureUserExists(userId);

  const promptText = `Compliance audit for ${businessProfile.businessType || 'business'} in ${businessProfile.state || 'India'}`;
  const targetConvId = await ensureConversationWithTitle(userId, 'COMPLIANCE', promptText, conversationId);

  if (!businessProfile.businessType?.trim() || !businessProfile.state?.trim()) {
    const missing = [];
    if (!businessProfile.businessType?.trim()) missing.push('businessType');
    if (!businessProfile.state?.trim()) missing.push('state');

    const summary = `[INFO_REQUIRED] To compile your compliance checklist, please provide the missing business details: ` +
      missing.map(m => m === 'businessType' ? 'Business Type' : 'State').join(' and ') + '.';

    // Save query to chat history
    await prisma.query.create({
      data: {
        userId,
        mode: 'COMPLIANCE',
        inputText: promptText,
        response: summary,
        confidence: 1.0,
        confidenceLevel: 'HIGH',
        citationsRaw: [] as any,
        citationsVerified: [] as any,
        hallucinationFlagged: false,
        latencyMs: 0,
        promptTokens: 0,
        responseTokens: 0,
        totalTokens: 0,
        conversationId: targetConvId,
      }
    });

    return {
      reportId: 'info-required',
      conversationId: targetConvId,
      title: 'Information Required',
      summary,
      response: summary,
      items: [],
      totalItems: 0,
      urgentCount: 0,
      confidenceScore: 1.0,
      confidenceLevel: 'HIGH' as const,
      latencyMs: 0,
      fromCache: false,
    };
  }

  const result = await complianceAgent.run({ businessProfile, userId, model });

  // Save successful compliance query to DB
  await prisma.query.create({
    data: {
      userId,
      mode: 'COMPLIANCE',
      inputText: promptText,
      response: result.response || result.summary,
      confidence: result.confidenceScore,
      confidenceLevel: result.confidenceLevel,
      citationsRaw: [] as any,
      citationsVerified: [] as any,
      hallucinationFlagged: false,
      latencyMs: result.latencyMs,
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
      conversationId: targetConvId,
    }
  });

  await redisClient.del(`history:${userId}`);

  return {
    reportId:        result.reportId,
    conversationId:  targetConvId,
    title:           result.title,
    summary:         result.summary,
    items:           result.items,
    totalItems:      result.totalItems,
    urgentCount:     result.urgentCount,
    confidenceScore: result.confidenceScore,
    confidenceLevel: result.confidenceLevel,
    latencyMs:       result.latencyMs,
    fromCache:       result.fromCache,
    response:        result.response,
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

  console.log(`🗄️ Fetching history for ${userId} from Database`);
  const history = await getUserHistory(userId);

  const historyWithTitles = await Promise.all(
    history.map(async (item: any) => {
      let title = item.conversation?.title;
      if (!title || title.length > 50) {
        title = await GroqProvider.generateTitle(item.inputText);
      }
      return {
        ...item,
        title,
      };
    })
  );

  return historyWithTitles;
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
      conversations = await Promise.all(
        legacyQueries.map(async (q) => {
          let title = q.inputText.split('\n')[0].trim();
          if (title.length > 30) {
            title = await GroqProvider.generateTitle(q.inputText);
          }
          return {
            id:         q.id,
            userId,
            title,
            persona:    'ADVOCATE',
            mode:       q.mode,
            source:     q.source,
            isArchived: false,
            createdAt:  q.createdAt,
            updatedAt:  q.createdAt,
          } as any;
        })
      );
      total = totalLegacy;
    }
  } else {
    // For real DB conversations, ensure titles are concise via Groq if missing or too long
    conversations = await Promise.all(
      conversations.map(async (conv) => {
        if (!conv.title || conv.title.length > 45) {
          const firstQuery = await prisma.query.findFirst({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'asc' },
            select: { inputText: true },
          });
          if (firstQuery?.inputText) {
            const aiTitle = await GroqProvider.generateTitle(firstQuery.inputText);
            await prisma.conversation.update({
              where: { id: conv.id },
              data: { title: aiTitle },
            });
            return { ...conv, title: aiTitle };
          }
        }
        return conv;
      })
    );
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
  if (conversation) {
    if (conversation.mode === 'COMPLIANCE') {
      const reports = await prisma.complianceReport.findMany({
        where: { userId },
        include: { items: { orderBy: { priority: 'asc' } } },
        orderBy: { createdAt: 'desc' }
      });
      
      const mappedQueries = conversation.queries.map(q => {
        if (q.mode === 'COMPLIANCE') {
          const matchedReport = reports.find(r => Math.abs(r.createdAt.getTime() - q.createdAt.getTime()) < 10000);
          if (matchedReport) {
            return {
              ...q,
              reportId: matchedReport.id,
              complianceItems: matchedReport.items
            } as any;
          }
        }
        return q;
      });

      return {
        ...conversation,
        queries: mappedQueries
      };
    }
    return conversation;
  }

  const query = await prisma.query.findFirst({
    where: { id: conversationId, userId }
  });

  if (query) {
    if (query.conversationId) {
      const fullConv = await getConversationById(query.conversationId, userId);
      if (fullConv) {
        return fullConv;
      }
    }

    let reportId: string | undefined;
    let complianceItems: any[] | undefined;

    if (query.mode === 'COMPLIANCE') {
      const matchedReport = await prisma.complianceReport.findFirst({
        where: {
          userId,
          createdAt: {
            gte: new Date(query.createdAt.getTime() - 5000),
            lte: new Date(query.createdAt.getTime() + 5000)
          }
        },
        include: { items: { orderBy: { priority: 'asc' } } }
      });
      if (matchedReport) {
        reportId = matchedReport.id;
        complianceItems = matchedReport.items;
      }
    }

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
      queries:    [{
        ...query,
        ...(reportId ? { reportId, complianceItems } : {})
      }],
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

export const deleteConversation = async (conversationId: string, userId: string) => {
  const deleted = await deleteConversationById(conversationId, userId);
  if (!deleted) {
    throw new AppError('Conversation not found or access denied', 404);
  }
  return { deleted: true };
};

export interface SaveFullConversationInput {
  conversationId?: string;
  title?: string;
  mode?: 'RESEARCH' | 'CASE_ANALYSIS' | 'COMPLIANCE' | 'DRAFT';
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    citations?: any[];
  }>;
}

export const saveFullConversationThread = async (userId: string, data: SaveFullConversationInput) => {
  await ensureUserExists(userId);

  const mode = data.mode || 'RESEARCH';
  let targetConvId = data.conversationId;

  const firstUserMsg = data.messages?.find(m => m.role === 'user')?.content || 'New Conversation';
  const title = data.title || firstUserMsg.split('\n')[0].substring(0, 45);

  if (targetConvId && !targetConvId.startsWith('temp_')) {
    const existing = await prisma.conversation.findUnique({
      where: { id: targetConvId },
    });
    if (existing) {
      await prisma.conversation.update({
        where: { id: targetConvId },
        data: { title, updatedAt: new Date() },
      });
    } else {
      const newConv = await prisma.conversation.create({
        data: {
          id: targetConvId,
          userId,
          title,
          persona: 'ADVOCATE',
          mode,
          source: 'WEB',
        },
      });
      targetConvId = newConv.id;
    }
  } else {
    const newConv = await prisma.conversation.create({
      data: {
        userId,
        title,
        persona: 'ADVOCATE',
        mode,
        source: 'WEB',
      },
    });
    targetConvId = newConv.id;
  }

  // Sync user-assistant pairs to DB
  if (Array.isArray(data.messages) && data.messages.length > 0) {
    const queriesToCreate = [];
    for (let i = 0; i < data.messages.length; i++) {
      const userMsg = data.messages[i];
      if (userMsg && userMsg.role === 'user') {
        const assistantMsg = data.messages[i + 1]?.role === 'assistant' ? data.messages[i + 1] : null;
        queriesToCreate.push({
          userId,
          mode,
          inputText: userMsg.content,
          response: assistantMsg?.content || '',
          confidence: 1.0,
          confidenceLevel: 'HIGH' as const,
          citationsRaw: (assistantMsg?.citations || []) as any,
          citationsVerified: (assistantMsg?.citations || []) as any,
          hallucinationFlagged: false,
          conversationId: targetConvId,
        });
      }
    }

    if (queriesToCreate.length > 0) {
      await prisma.query.deleteMany({
        where: { conversationId: targetConvId, userId },
      });

      await prisma.query.createMany({
        data: queriesToCreate,
      });
    }
  }

  const fullConversation = await getConversationById(targetConvId, userId);
  return fullConversation;
};