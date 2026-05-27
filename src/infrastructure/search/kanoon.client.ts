// src/infrastructure/search/kanoon.client.ts
import { redisClient } from "../../config/redis";
import { env } from "../../config/env";

export interface KanoonVerificationResult {
  verified: boolean;
  kanoonUrl?: string;
}

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

    if (!response.ok) {
      console.error(`Kanoon API Error (${response.status}):`, response.statusText);
      return { verified: false };
    }

    const data = await response.json();

    // 4. Verification Logic & URL Extraction
    let result: KanoonVerificationResult = { verified: false };

    if (data.docs && data.docs.length > 0) {
      result = {
        verified: true,
        // Grab the ID of the top matching case to build the URL
        kanoonUrl: `https://indiankanoon.org/doc/${data.docs[0].tid}/`
      };
    }

    // 5. Save the entire object to Redis (Cache for 7 days / 604800 seconds)
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 604800);

    return result;

  } catch (error) {
    console.error('Failed to verify citation with Kanoon API:', error);
    // Fail safely without crashing the LangGraph pipeline
    return { verified: false };
  }
}