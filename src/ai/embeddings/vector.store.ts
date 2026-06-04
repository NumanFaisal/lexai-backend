// src/ai/embeddings/vector.store.ts
import { prisma } from '../../config/db';  // named export — matches db.ts

export interface PrecedentSearchResult {
  id:         string;
  title:      string;
  content:    string;
  similarity: number; // 0.0 to 1.0 — higher is more similar
}

export class VectorStore {
  /**
   * Finds the most semantically relevant case precedents using cosine similarity.
   * Requires pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
   *
   * @param embedding  - Query vector (1536 dims from text-embedding-3-small)
   * @param limit      - Maximum number of results (default: 3)
   * @param minScore   - Minimum similarity threshold (default: 0.4 — ignore weak matches)
   */
  static async searchSimilarPrecedents(
    embedding: number[],
    limit: number = 3,
    minScore: number = 0.4
  ): Promise<PrecedentSearchResult[]> {
    // Convert TS number[] to Postgres vector string: '[0.1, 0.2, ...]'
    const embeddingString = `[${embedding.join(',')}]`;

    // 1 - distance (<=>) gives cosine similarity (0 to 1)
    // ORDER BY distance ASC = most similar first
    const results = await prisma.$queryRaw<PrecedentSearchResult[]>`
      SELECT
        id,
        title,
        content,
        1 - (embedding <=> ${embeddingString}::vector) AS similarity
      FROM precedents
      WHERE 1 - (embedding <=> ${embeddingString}::vector) > ${minScore}
      ORDER BY embedding <=> ${embeddingString}::vector
      LIMIT ${limit};
    `;

    return results;
  }
}