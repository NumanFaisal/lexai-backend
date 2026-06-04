// src/ai/embeddings/embeddings.provider.ts
import OpenAI from 'openai';
import { env } from '../../config/env';

// Use validated env config — never access process.env directly
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export class EmbeddingProvider {
  /**
   * Converts plain text into a 1536-dimensional vector array.
   * Uses text-embedding-3-small — highly accurate for legal/complex text.
   */
  static async embedText(text: string): Promise<number[]> {
    const cleaned = text.replace(/\n/g, ' ').trim(); // Cleaning newlines improves quality

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: cleaned,
    });

    return response.data[0].embedding;
  }
}