import { BaseAgent } from '../base.agent';
import { getLLM } from '../../providers/llm.factory';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SUGGESTION_AGENT_PROMPT } from '../../prompts/drafting/suggestion.prompt';

export interface DraftSuggestion {
  id: string;
  text: string;
  type: 'improvement' | 'warning';
  actionPrompt: string;
}

export class SuggestionAgent extends BaseAgent {
  constructor() {
    super('DRAFT');
  }

  async generateSuggestions(
    documentContent: string,
    documentType: string = 'Legal Document'
  ): Promise<DraftSuggestion[]> {
    const llm = getLLM('gpt-4o', { temperature: 0.3, maxTokens: 1000 });

    const messages = [
      new SystemMessage(`${SUGGESTION_AGENT_PROMPT}\n\nDocument Type: ${documentType}`),
      new HumanMessage(`Document Content:\n${documentContent}`)
    ];

    try {
      const response = await llm.invoke(messages);
      const rawText = response.content.toString();

      const parsed = this.safeParseJSON<DraftSuggestion[]>(rawText);
      if (parsed && Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error) {
      console.error('[SuggestionAgent] Error generating suggestions:', error);
      return [];
    }
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
export const suggestionAgent = new SuggestionAgent();
