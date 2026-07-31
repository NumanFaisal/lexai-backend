// src/ai/agents/drafting/review.agent.ts

import { BaseAgent } from '../base.agent';
import { getLLM } from '../../providers/llm.factory';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { CONTRACT_REVIEW_PROMPT } from '../../prompts/drafting/review.prompt';

export interface ReviewResult {
  summaryOfChanges: string;
  rewrittenContent: string;
}

export type IntentType = 'revise' | 'ask';

export interface RevisionResponse {
  status: 'REVISED' | 'NEEDS_CLARIFICATION';
  revisedHTML?: string;
  clarificationQuestion?: string;
  summaryOfChanges?: string;
}

// Keywords that strongly signal user wants to EDIT the document
const REVISE_KEYWORDS = [
  'change', 'update', 'add', 'remove', 'delete', 'replace', 'modify',
  'insert', 'include', 'fix', 'correct', 'rewrite', 'edit', 'revise',
  'make it', 'set the', 'put', 'write', 'draft', 'create', 'append',
  'increase', 'decrease', 'reduce', 'extend', 'shorten', 'rename',
  'move', 'swap', 'convert', 'translate', 'strengthen', 'weaken',
  'बदलो', 'जोड़ो', 'हटाओ', 'सुधारो', // Hindi edit keywords
];

export class ReviewAgent extends BaseAgent {
  constructor() {
    super('DRAFT');
  }

  /**
   * Classify whether user instruction is a revision command or a question.
   * Uses keyword matching first, then LLM fallback for ambiguous cases.
   */
  detectIntent(instruction: string): IntentType {
    const lower = instruction.toLowerCase().trim();

    // Explicit question patterns
    const isQuestion =
      lower.startsWith('what') ||
      lower.startsWith('why') ||
      lower.startsWith('how') ||
      lower.startsWith('when') ||
      lower.startsWith('where') ||
      lower.startsWith('who') ||
      lower.startsWith('is ') ||
      lower.startsWith('are ') ||
      lower.startsWith('does ') ||
      lower.startsWith('can ') ||
      lower.startsWith('explain') ||
      lower.startsWith('tell me') ||
      lower.startsWith('summarize') ||
      lower.startsWith('list') ||
      lower.endsWith('?');

    if (isQuestion) return 'ask';

    // Check for revision keywords
    const hasReviseKeyword = REVISE_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasReviseKeyword) return 'revise';

    // Default: if short declarative sentence, treat as revision
    // e.g. "fee to 5000" or "advocate name Ravi Kumar"
    if (lower.split(' ').length <= 8 && !lower.endsWith('?')) return 'revise';

    return 'ask';
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

  /**
   * Revise an HTML document based on user instruction.
   * If the instruction is too vague, returns NEEDS_CLARIFICATION with a question.
   * Otherwise returns the revised HTML.
   */
  async reviseHTMLDocument(
    _userId: string,
    originalHTML: string,
    documentType: string,
    userInstructions: string
  ): Promise<RevisionResponse> {
    const llm = getLLM('gpt-4o', { temperature: 0.2, maxTokens: 6000 });

    const { DRAFT_REVISION_PROMPT } = await import('../../prompts/drafting/index.js');

    const systemPrompt = `${DRAFT_REVISION_PROMPT}

Document Type: ${documentType}

CRITICAL BEHAVIOR — When to Revise vs When to Ask:
You are a senior Indian advocate AI assistant helping users edit legal documents.

## TWO TYPES OF EDITS — Handle them differently:

### TYPE 1 — STRUCTURAL EDITS (add/expand/remove sections, clauses, paragraphs)
Instructions like:
- "Add content to Relevant Facts"
- "Add a section on arbitration"
- "Expand the termination clause"
- "Remove the indemnification clause"

For these: ALWAYS proceed with the edit immediately. Do NOT ask for clarification.
Use professional, legally appropriate placeholder content (e.g., "[Relevant facts to be inserted by advocate]") if specific details aren't provided.
The document already has placeholder fields like {{field_name}} — keep them intact for sections you're not editing.

### TYPE 2 — VALUE EDITS (require a specific value you don't have)
Instructions like:
- "Change the fee" (without an amount)
- "Update the date" (without specifying which date)
- "Set the advocate name" (without a name given)

For these: Ask for the ONE missing specific value before making the change.

## RESPONSE FORMAT
Return a JSON object in ONE of these formats:

FORMAT 1 — When proceeding with the edit (use this for ALL structural edits):
{
  "status": "REVISED",
  "summaryOfChanges": "Brief description of what was changed",
  "revisedHTML": "...complete revised HTML document..."
}

FORMAT 2 — Only for value edits where a specific value is truly missing:
{
  "status": "NEEDS_CLARIFICATION",
  "clarificationQuestion": "A single, specific question asking for the missing value. Be concise."
}

## RULES:
- Structural edits (add/remove/expand sections) → ALWAYS use FORMAT 1. Never ask for clarification.
- Value edits with missing data → use FORMAT 2, ask for ONE value at a time.
- The revisedHTML must be the COMPLETE document HTML — not just the changed section.
- Preserve all existing {{placeholder}} fields and HTML structure that are not being changed.
- For new content without specific details, use bracketed professional placeholders like [To be specified by advocate].`;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(`User Instruction: ${userInstructions}\n\nCurrent HTML Document:\n${originalHTML}`)
    ];

    const response = await llm.invoke(messages);
    let rawText = response.content.toString();

    // Strip markdown backticks if LLM wrapped in code fences
    rawText = rawText
      .replace(/^```(?:json|html)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = this.safeParseJSON<{
      status: string;
      revisedHTML?: string;
      clarificationQuestion?: string;
      summaryOfChanges?: string;
    }>(rawText);

    if (parsed) {
      if (parsed.status === 'NEEDS_CLARIFICATION' && parsed.clarificationQuestion) {
        return {
          status: 'NEEDS_CLARIFICATION',
          clarificationQuestion: parsed.clarificationQuestion,
        };
      }

      if (parsed.status === 'REVISED' && parsed.revisedHTML) {
        let html = parsed.revisedHTML;
        // Clean up any stray markdown backticks inside the HTML string
        html = html.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '').trim();
        return {
          status: 'REVISED',
          revisedHTML: html,
          summaryOfChanges: parsed.summaryOfChanges || 'Document updated.',
        };
      }
    }

    // If parsing failed but response looks like raw HTML, treat as successful revision
    if (rawText.trim().startsWith('<')) {
      return {
        status: 'REVISED',
        revisedHTML: rawText,
        summaryOfChanges: 'Document updated per your instruction.',
      };
    }

    // Ultimate fallback: treat as clarification needed
    return {
      status: 'NEEDS_CLARIFICATION',
      clarificationQuestion: 'Could you provide more details about what exactly you\'d like me to change in the document?',
    };
  }

  async answerQuestion(documentContent: string, documentType: string, question: string): Promise<string> {
    const llm = getLLM('gpt-4o', { temperature: 0.3, maxTokens: 1000 });

    const messages = [
      new SystemMessage(
        `You are LexAI, an expert Indian legal assistant.\n` +
        `The user is asking a question about their drafted document.\n` +
        `Document Type: ${documentType}\n\n` +
        `Your task is to respond to their question directly and concisely.\n` +
        `Do NOT rewrite the entire document. Just answer their question clearly.\n` +
        `Format your response in plain text or simple markdown. Keep it under 200 words.`
      ),
      new HumanMessage(`Document Content:\n${documentContent}\n\nUser Question:\n${question}`)
    ];

    const response = await llm.invoke(messages);
    return response.content.toString();
  }

  private safeParseJSON<T>(raw: string): T | null {
    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}

// Singleton
export const reviewAgent = new ReviewAgent();
