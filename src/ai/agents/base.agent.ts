// src/ai/agents/base.agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — BaseAgent
//
// PURPOSE:
//   Abstract base class for all LexAI AI agents. Provides shared utilities:
//   - Redis caching (get/set with TTL)
//   - Hallucination guard integration
//   - Query persistence to DB
//   - Latency tracking
//   - Structured error handling
//
// USAGE:
//   export class ResearchAgent extends BaseAgent {
//     async run(params) { ... }
//   }
//
// NEVER call BaseAgent directly — it is abstract.
// ─────────────────────────────────────────────────────────────────────────────

import { redisClient } from '../../config/redis';
import { prisma } from '../../config/db';
import { hallucinationGuard, GuardResult, GuardOptions } from '../guards/hallucination.guard';
import { logger } from '../../config/logger';
import { QueryMode, ConfidenceLevel } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveQueryParams {
  userId:           string;
  inputText:        string;
  response:         string;
  mode:             QueryMode;
  confidenceScore:  number;
  citationsRaw?:    any[];
  citationsVerified?: any[];
  latencyMs?:       number;
  conversationId?:  string;
  promptTokens?:    number;
  responseTokens?:  number;
}

export interface AgentCacheOptions {
  ttlSeconds: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: BASE AGENT CLASS
// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseAgent {
  protected readonly agentMode: QueryMode;
  protected startTime: number = 0;

  constructor(mode: QueryMode) {
    this.agentMode = mode;
  }

  // ── Latency Tracking ─────────────────────────────────────────────────────

  protected startTimer(): void {
    this.startTime = Date.now();
  }

  protected getLatency(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  // ── Redis Cache Helpers ───────────────────────────────────────────────────

  /**
   * Returns cached value from Redis, or null if not found.
   * Never throws — Redis failure degrades gracefully.
   */
  protected async getCachedResult<T>(key: string): Promise<T | null> {
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        logger.debug({ msg: `[${this.agentMode}] Cache hit`, key });
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      // Non-fatal: Redis failure should never crash an AI request
      logger.warn({
        msg: `[${this.agentMode}] Redis GET failed`,
        key,
        error: (err as Error).message,
      });
    }
    return null;
  }

  /**
   * Stores a value in Redis with TTL. Never throws.
   */
  protected async setCachedResult(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<void> {
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
      logger.debug({ msg: `[${this.agentMode}] Cache set`, key, ttlSeconds });
    } catch (err) {
      logger.warn({
        msg: `[${this.agentMode}] Redis SET failed`,
        key,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Deletes a cache key (used for cache invalidation after writes).
   */
  protected async invalidateCache(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch {
      // Non-fatal
    }
  }

  // ── Hallucination Guard ───────────────────────────────────────────────────

  /**
   * Runs the full hallucination guard on LLM response text.
   * Returns the GuardResult with annotated response, citations, and confidence.
   *
   * All agents that produce legal text MUST call this before returning to users.
   */
  protected async runHallucinationGuard(
    responseText: string,
    options: GuardOptions = {}
  ): Promise<GuardResult> {
    logger.info({ msg: `[${this.agentMode}] Running hallucination guard` });

    try {
      return await hallucinationGuard.run(responseText, {
        skipKanoonVerification: false,
        annotateInlineMarkers: false,
        verbose: false,
        ...options,
      });
    } catch (err) {
      // Guard failure must NOT block the response — return a degraded result
      logger.error({
        msg: `[${this.agentMode}] Hallucination guard failed`,
        error: (err as Error).message,
      });

      // Return a safe fallback: treat response as-is, mark confidence as MEDIUM
      return {
        annotatedResponse: responseText,
        citationsRaw:      [],
        citationsVerified: [],
        confidenceScore:   0.5,
        confidenceLevel:   'MEDIUM',
        verifiedCount:     0,
        unverifiedCount:   0,
        totalCount:        0,
        durationMs:        0,
        cacheHits:         0,
      };
    }
  }

  // ── DB Persistence ────────────────────────────────────────────────────────

  /**
   * Persists a query record to PostgreSQL after every agent run.
   * Creates Citation child records for all verified citations.
   */
  protected async saveQuery(params: SaveQueryParams): Promise<{ id: string }> {
    const {
      userId,
      inputText,
      response,
      mode,
      confidenceScore,
      citationsRaw     = [],
      citationsVerified = [],
      latencyMs        = 0,
      conversationId,
      promptTokens     = 0,
      responseTokens   = 0,
    } = params;

    // Map float confidence to prisma enum
    let confidenceLevel: ConfidenceLevel = ConfidenceLevel.HIGH;
    if (confidenceScore < 0.5)       confidenceLevel = ConfidenceLevel.LOW;
    else if (confidenceScore < 0.8)  confidenceLevel = ConfidenceLevel.MEDIUM;

    try {
      const record = await prisma.query.create({
        data: {
          userId,
          mode,
          inputText,
          response,
          confidence:          confidenceScore,
          confidenceLevel,
          citationsRaw:        citationsRaw  as any,
          citationsVerified:   citationsVerified as any,
          hallucinationFlagged: confidenceScore < 0.5,
          latencyMs,
          promptTokens,
          responseTokens,
          totalTokens:         promptTokens + responseTokens,
          ...(conversationId ? { conversationId } : {}),
          // Create individual Citation rows for verified items
          citations: {
            create: citationsVerified
              .filter((c: any) => c.rawText)
              .map((c: any) => ({
                type:       c.type   ?? 'SECTION',
                rawText:    c.rawText,
                actName:    c.actName    ?? null,
                sectionNum: c.sectionNum ?? null,
                caseName:   c.caseName   ?? null,
                year:       c.year       ?? null,
                verified:   c.status === 'VERIFIED',
                kanoonUrl:  c.kanoonUrl  ?? null,
                kanoonDocId: c.kanoonDocId ?? null,
                ...(c.status === 'VERIFIED' ? { verifiedAt: new Date() } : {}),
              })),
          },
        },
        select: { id: true },
      });

      logger.info({
        msg:          `[${this.agentMode}] Query saved`,
        queryId:      record.id,
        userId,
        latencyMs,
        confidenceLevel,
      });

      return record;
    } catch (err) {
      // DB failure must not block the response — log and return a dummy ID
      logger.error({
        msg:   `[${this.agentMode}] Failed to save query`,
        error: (err as Error).message,
      });
      return { id: 'save-failed' };
    }
  }

  // ── Cache Key Builder ─────────────────────────────────────────────────────

  /**
   * Builds a stable Redis key for a given mode + userId + input.
   * Uses a simple hash to keep key length short.
   */
  protected buildCacheKey(userId: string, input: string): string {
    // Simple hash: sum of char codes mod 1M, padded
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;  // unsigned 32-bit
    }
    return `${this.agentMode.toLowerCase()}:${userId}:${hash}`;
  }
}
