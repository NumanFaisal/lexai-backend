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

  async reviseHTMLDocument(
    _userId: string,
    originalHTML: string,
    documentType: string,
    userInstructions: string
  ): Promise<string> {
    const llm = getLLM('gpt-4o', { temperature: 0.2, maxTokens: 4000 });
    
    const { DRAFT_REVISION_PROMPT } = await import('../../prompts/drafting/index');

    const messages = [
      new SystemMessage(`${DRAFT_REVISION_PROMPT}\n\nDocument Type: ${documentType}`),
      new HumanMessage(`User Instructions: ${userInstructions}\n\nOriginal HTML Document:\n${originalHTML}`)
    ];

    const response = await llm.invoke(messages);
    let html = response.content.toString();
    
    // Clean up any potential markdown backticks that the LLM might have included despite instructions
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/\s*```\s*$/, "").trim();
    
    return html;
  }

  async answerQuestion(documentContent: string, documentType: string, question: string): Promise<string> {
    const llm = getLLM('gpt-4o', { temperature: 0.3, maxTokens: 1000 });
    
    const messages = [
      new SystemMessage(
        `You are LexAI, an expert Indian legal assistant.\n` +
        `The user is asking a question or requesting a revision about their drafted document.\n` +
        `Document Type: ${documentType}\n\n` +
        `Your task is to respond to their question directly and concisely.\n` +
        `Do NOT rewrite the entire document. Just answer their question, provide advice, or offer the specific text snippet they requested to insert.\n` +
        `Format your response in plain text or simple markdown.`
      ),
      new HumanMessage(`Document Content:\n${documentContent}\n\nUser Question/Instruction:\n${question}`)
    ];

    const response = await llm.invoke(messages);
    return response.content.toString();
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
