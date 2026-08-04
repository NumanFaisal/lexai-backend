// src/infrastructure/search/kanoon.client.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Indian Kanoon API Client
//
// Two public functions:
//   1. verifyWithKanoon()        — Citation verification (used by hallucination guard)
//   2. searchKanoonPrecedents()  — Precedent search (used by case analysis pipeline)
// ─────────────────────────────────────────────────────────────────────────────

import { redisClient } from "../../config/redis";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface KanoonVerificationResult {
  verified: boolean;
  kanoonUrl?: string;
}

export interface KanoonSearchResult {
  title:     string;   // Case title (e.g., "Gurbaksh Singh Sibbia v. State of Punjab")
  snippet:   string;   // Headline/summary text from Kanoon
  kanoonUrl: string;   // Direct link to the judgment
  docId:     string;   // Kanoon document ID (tid)
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL = {
  VERIFICATION: 604_800,   // 7 days — judgments don't change
  SEARCH:       3_600,     // 1 hour — search rankings can shift
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Strip HTML tags from Kanoon snippets
// Kanoon returns headline/snippet with <b>, <i>, etc. — we need plain text.
// ─────────────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')       // Remove HTML tags
    .replace(/&amp;/g, '&')       // Decode common entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')         // Collapse whitespace
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: verifyWithKanoon()
// Used by: hallucination guard, research pipeline
// Purpose: Check if a cited case/section actually exists in Indian Kanoon
// ─────────────────────────────────────────────────────────────────────────────

export const verifyWithKanoon = async (query: string): Promise<KanoonVerificationResult> => {
  if (!query) return { verified: false };

  // 1. Create a safe, URL-friendly cache key
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, '_');
  const cacheKey = `kanoon_verify:${normalizedQuery}`;

  try { 
    // 2. Check Redis cache first
    const cachedResult = await redisClient.get(cacheKey);
    if (cachedResult) {
      console.log(`⚡ Kanoon Cache Hit: [${query}]`);
      // Parse the stored JSON object back into our interface
      return JSON.parse(cachedResult) as KanoonVerificationResult;
    }

    console.log(`🔍 Kanoon API Fetch: Verifying [${query}]...`);

    // 3. Fetch from Indian Kanoon API
    const kanoonUrl = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}`;

    const response = await fetch(kanoonUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${env.INDIAN_KANOON_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const fallbackUrl = `https://indiankanoon.org/search/?formInput=${encodeURIComponent(query)}`;

    if (!response.ok) {
      console.error(`Kanoon API Error (${response.status}):`, response.statusText);
      return { verified: false, kanoonUrl: fallbackUrl };
    }

    const data = await response.json();

    // 4. Verification Logic & URL Extraction
    let result: KanoonVerificationResult = {
      verified: false,
      kanoonUrl: fallbackUrl,
    };

    if (data.docs && data.docs.length > 0) {
      result = {
        verified: true,
        kanoonUrl: `https://indiankanoon.org/doc/${data.docs[0].tid}/`
      };
    }

    // 5. Save the entire object to Redis (Cache for 7 days / 604800 seconds)
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL.VERIFICATION);

    return result;

  } catch (error) {
    console.error('Failed to verify citation with Kanoon API:', error);
    return {
      verified: false,
      kanoonUrl: `https://indiankanoon.org/search/?formInput=${encodeURIComponent(query)}`,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: searchKanoonPrecedents()
// Used by: case analysis pipeline (Kanoon fallback node)
// Purpose: Search Indian Kanoon for relevant case law to inject as RAG context
//
// Why this exists:
//   When the local pgvector store doesn't have enough matching precedents,
//   we fall back to Kanoon to find real, verified case law — preventing
//   the LLM from relying solely on training data (which can hallucinate).
// ─────────────────────────────────────────────────────────────────────────────

export const searchKanoonPrecedents = async (
  query: string,
  limit: number = 3,
): Promise<KanoonSearchResult[]> => {
  if (!query || query.trim().length === 0) return [];

  // 1. Cache key for search results (separate namespace from verification)
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, '_');
  const cacheKey = `kanoon_search:${normalizedQuery}:${limit}`;

  try {
    // 2. Check Redis cache first
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      logger.info({ msg: '[kanoon.client] Search cache hit', query: query.slice(0, 80) });
      return JSON.parse(cached) as KanoonSearchResult[];
    }

    logger.info({ msg: '[kanoon.client] Searching Kanoon for precedents', query: query.slice(0, 80), limit });

    // 3. Call Indian Kanoon Search API
    const searchUrl = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${env.INDIAN_KANOON_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn({
        msg: '[kanoon.client] Kanoon search API error',
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const data = await response.json();

    // 4. Parse response — extract top N results with title, snippet, and URL
    if (!data.docs || !Array.isArray(data.docs) || data.docs.length === 0) {
      logger.info({ msg: '[kanoon.client] Kanoon returned no results', query: query.slice(0, 80) });
      return [];
    }

    const results: KanoonSearchResult[] = data.docs
      .slice(0, limit)
      .map((doc: any) => ({
        title:     stripHtml(doc.title ?? 'Untitled'),
        snippet:   stripHtml(doc.headline ?? doc.docsource ?? ''),
        kanoonUrl: `https://indiankanoon.org/doc/${doc.tid}/`,
        docId:     String(doc.tid),
      }))
      .filter((r: KanoonSearchResult) => r.title && r.docId); // Drop malformed entries

    logger.info({
      msg: '[kanoon.client] Kanoon search complete',
      resultsFound: results.length,
      titles: results.map(r => r.title.slice(0, 60)),
    });

    // 5. Cache search results (1-hour TTL — search rankings can shift)
    if (results.length > 0) {
      await redisClient.set(cacheKey, JSON.stringify(results), 'EX', CACHE_TTL.SEARCH);
    }

    return results;

  } catch (error) {
    // Non-fatal: return empty array so the pipeline continues without Kanoon results
    logger.error({
      msg: '[kanoon.client] Kanoon search failed',
      error: (error as Error).message,
      query: query.slice(0, 80),
    });
    return [];
  }
};