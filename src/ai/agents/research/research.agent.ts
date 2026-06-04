// src/ai/agents/research/research.agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Research Agent
//
// Wraps the existing LangGraph research pipeline with:
// - Redis response caching (1 hour TTL)
// - Cache invalidation on new queries
// - Structured return type
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from '../base.agent';
import { runResearchPipeline, ResearchResult } from '../../pipelines/research.pipeline';
import { SupportedModel } from '../../../config/llm.config';
import { logger } from '../../../config/logger';
import { BaseMessage } from '@langchain/core/messages';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface ResearchAgentInput {
  query:               string;
  userId:              string;
  model?:              SupportedModel;
  conversationHistory?: BaseMessage[];
}

export interface ResearchAgentOutput {
  queryId:         string;
  response:        string;
  confidenceScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  citations:       any[];
  latencyMs:       number;
  fromCache:       boolean;
}

export class ResearchAgent extends BaseAgent {
  constructor() {
    super('RESEARCH');
  }

  async run(input: ResearchAgentInput): Promise<ResearchAgentOutput> {
    this.startTimer();

    const { query, userId, model = 'gemini-2.0-flash', conversationHistory = [] } = input;

    // ── Step 1: Check Redis cache ──────────────────────────────────────────
    const cacheKey = this.buildCacheKey(userId, query);
    const cached = await this.getCachedResult<ResearchAgentOutput>(cacheKey);

    if (cached) {
      logger.info({ msg: '[ResearchAgent] Cache hit', userId, cacheKey });
      return { ...cached, fromCache: true, latencyMs: this.getLatency() };
    }

    // ── Step 2: Run LangGraph research pipeline ────────────────────────────
    logger.info({ msg: '[ResearchAgent] Cache miss — running pipeline', userId, model });

    const result: ResearchResult = await runResearchPipeline({
      query,
      userId,
      selectedModel:       model,
      conversationHistory,
    });

    // ── Step 3: Save query to DB ───────────────────────────────────────────
    const saved = await this.saveQuery({
      userId,
      inputText:         query,
      response:          result.finalResponse,
      mode:              'RESEARCH',
      confidenceScore:   result.confidenceScore,
      citationsVerified: result.citationsVerified as any[],
      latencyMs:         this.getLatency(),
    });

    // ── Step 4: Cache the result ───────────────────────────────────────────
    const output: ResearchAgentOutput = {
      queryId:         saved.id,
      response:        result.finalResponse,
      confidenceScore: result.confidenceScore,
      confidenceLevel: result.confidenceLevel,
      citations:       result.citationsVerified,
      latencyMs:       this.getLatency(),
      fromCache:       false,
    };

    await this.setCachedResult(cacheKey, output, CACHE_TTL_SECONDS);

    return output;
  }
}

// Singleton instance
export const researchAgent = new ResearchAgent();
