// src/ai/agents/drafting/review.agent.ts

import { BaseAgent } from '../base.agent';
import { getLLM } from '../../providers/llm.factory';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { CONTRACT_REVIEW_PROMPT } from '../../prompts/drafting/review.prompt';

export interface ReviewResult {
  summaryOfChanges: string;
  rewrittenContent: string;
}

export class ReviewAgent extends BaseAgent {
  constructor() {
    super('DRAFT');
  }

  async reviewDocument(
    _userId: string,
    originalText: string,
    documentType: string,
    userInstructions: string = ''
  ): Promise<ReviewResult> {
    const llm = getLLM('gpt-4o', { temperature: 0.2, maxTokens: 4000 });

    const messages = [
      new SystemMessage(`${CONTRACT_REVIEW_PROMPT}\n\nDocument Type: ${documentType}`),
      new HumanMessage(`User Instructions: ${userInstructions}\n\nOriginal Document:\n${originalText}`)
    ];

    const response = await llm.invoke(messages);
    const rawText = response.content.toString();

    const parsed = this.safeParseJSON<ReviewResult>(rawText);
    if (parsed && parsed.rewrittenContent) {
      return {
        summaryOfChanges: parsed.summaryOfChanges || 'Updated document for compliance and intent.',
        rewrittenContent: parsed.rewrittenContent
      };
    }

    // Fallback if parsing fails
    return {
      summaryOfChanges: 'Reviewed and edited the document according to instructions.',
      rewrittenContent: rawText
    };
  }

  private safeParseJSON<T>(raw: string): T | null {
    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}

// Singleton
export const reviewAgent = new ReviewAgent();
