// src/ai/embeddings/vector.store.ts
import { prisma } from '../../config/db';  // named export — matches db.ts

export interface PrecedentSearchResult {
  id:         string;
  title:      string;
  content:    string;
  similarity: number; // 0.0 to 1.0 — higher is more similar
}

export interface ChatDocumentSearchResult {
  id: string;
  fileTitle: string;
  content: string;
  similarity: number;
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

  // Searches isolated user documents tied to a specific chat session
  static async searchChatDocuments(
    conversationId: string,
    embedding: number[],
    limit: number = 4,
    minScore: number = 0.4
  ): Promise<ChatDocumentSearchResult[]> {
    const embeddingString = `[${embedding.join(',')}]`;

    // Join UserCaseChunk through UserCaseFile to enforce conversationId constraints
    const results = await prisma.$queryRaw<ChatDocumentSearchResult[]>`
      SELECT
        ucc.id,
        ucf.title AS "fileTitle",
        ucc.content,
        1 - (ucc.embedding <=> ${embeddingString}::vector) AS similarity
      FROM user_case_chunks ucc
      JOIN user_case_files ucf ON ucc."caseFileId" = ucf.id
      WHERE ucf."conversationId" = ${conversationId}
        AND 1 - (ucc.embedding <=> ${embeddingString}::vector) > ${minScore}
      ORDER BY ucc.embedding <=> ${embeddingString}::vector
      LIMIT ${limit};
    `;

    return results;
  }
}