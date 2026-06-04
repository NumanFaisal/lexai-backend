// src/ai/agents/case-analysis/case-analysis.agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Case Analysis Agent
//
// Wraps the case-analysis LangGraph pipeline with:
// - Redis response caching (1 hour TTL)
// - Hallucination guard integration (via pipeline)
// - DB persistence via BaseAgent.saveQuery
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from '../base.agent';
import { runCaseAnalysisPipeline, CaseAnalysisResult } from '../../pipelines/case-analysis.pipeline';
import { SupportedModel } from '../../../config/llm.config';
import { logger } from '../../../config/logger';
import { BaseMessage } from '@langchain/core/messages';

const CACHE_TTL_SECONDS = 3600; // 1 hour

export interface CaseAnalysisAgentInput {
  query:               string;
  userId:              string;
  model?:              SupportedModel;
  conversationHistory?: BaseMessage[];
}

export interface CaseAnalysisAgentOutput {
  queryId:          string;
  response:         string;
  confidenceScore:  number;
  confidenceLevel:  'HIGH' | 'MEDIUM' | 'LOW';
  citations:        any[];
  precedentsFound:  number;
  latencyMs:        number;
  fromCache:        boolean;
}

export class CaseAnalysisAgent extends BaseAgent {
  constructor() {
    super('CASE_ANALYSIS');
  }

  async run(input: CaseAnalysisAgentInput): Promise<CaseAnalysisAgentOutput> {
    this.startTimer();

    const { query, userId, model = 'gemini-2.0-flash', conversationHistory = [] } = input;

    // ── Step 1: Check Redis cache ──────────────────────────────────────────
    const cacheKey = this.buildCacheKey(userId, query);
    const cached   = await this.getCachedResult<CaseAnalysisAgentOutput>(cacheKey);

    if (cached) {
      logger.info({ msg: '[CaseAnalysisAgent] Cache hit', userId, cacheKey });
      return { ...cached, fromCache: true, latencyMs: this.getLatency() };
    }

    // ── Step 2: Run LangGraph pipeline ────────────────────────────────────
    logger.info({ msg: '[CaseAnalysisAgent] Cache miss — running pipeline', userId, model });

    const result: CaseAnalysisResult = await runCaseAnalysisPipeline({
      query,
      userId,
      selectedModel:       model,
      conversationHistory,
    });

    // ── Step 3: Save to DB ─────────────────────────────────────────────────
    const saved = await this.saveQuery({
      userId,
      inputText:         query,
      response:          result.finalResponse,
      mode:              'CASE_ANALYSIS',
      confidenceScore:   result.confidenceScore,
      citationsVerified: result.citationsVerified as any[],
      latencyMs:         this.getLatency(),
      promptTokens:      result.metadata.inputTokens,
      responseTokens:    result.metadata.outputTokens,
    });

    // ── Step 4: Cache and return ───────────────────────────────────────────
    const output: CaseAnalysisAgentOutput = {
      queryId:         saved.id,
      response:        result.finalResponse,
      confidenceScore: result.confidenceScore,
      confidenceLevel: result.confidenceLevel,
      citations:       result.citationsVerified,
      precedentsFound: result.precedentsFound,
      latencyMs:       this.getLatency(),
      fromCache:       false,
    };

    await this.setCachedResult(cacheKey, output, CACHE_TTL_SECONDS);

    return output;
  }
}

// Singleton
export const caseAnalysisAgent = new CaseAnalysisAgent();