import axios from 'axios';
import { env } from '../../config/env';

export class GroqProvider {
  /**
   * Fast, ultra-cheap chat title generation using Groq API via Axios
   */
  static async generateTitle(userPrompt: string): Promise<string> {
    const fallbackTitle =
      userPrompt.trim().split('\n')[0].substring(0, 35) +
      (userPrompt.length > 35 ? '...' : '');

    try {
      const apiKey = process.env.GROQ_API_KEY || env.GROQ_API_KEY;
      if (!apiKey) {
        console.warn('⚠️ GROQ_API_KEY missing, using fallback title');
        return fallbackTitle;
      }

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content:
                'You are a title generator for a legal AI assistant. Generate a concise 3 to 6 word title that accurately summarizes the query. Output ONLY the title text. Do NOT use quotes, markdown formatting, or punctuation.',
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 25,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      const title = response.data?.choices?.[0]?.message?.content?.trim();

      if (title) {
        // Clean up any stray quotes or formatting
        const cleanTitle = title.replace(/^["'`\s]+|["'`\s]+$/g, '');
        return cleanTitle || fallbackTitle;
      }
    } catch (err) {
      console.error('⚠️ Groq title generation failed:', err);
    }

    return fallbackTitle;
  }
}
