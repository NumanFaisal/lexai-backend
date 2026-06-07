// src/queues/case-file/case-file.processor.ts

import { RecursiveCharacterTextSplitter } from '../../shared/utils/text-splitter';
import  { EmbeddingProvider } from '../../ai/embeddings/embeddings.provider';
import { prisma } from '../../config/db';
import { logger } from '../../config/logger';


export async function processUserCaseFileJob(jobData: { caseFileId: string; rawText: string }) {
    try {
      const { caseFileId, rawText } = jobData;
      logger.info({ msg: 'Starting chunking and embedding generation', caseFileId });

      // 1. Chunking strategy optimized for legal facts (similar to TathyaNyaya's segments)
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 150
      });

      const docs = await splitter.createDocuments([rawText]);

      // 2. Multi-row insertion for pgvector
      for (const doc of docs) {
        const embedding = await EmbeddingProvider.embedText(doc.pageContent);
        const vectorString = `[${embedding.join(',')}]`;

        // Safely insert vector using Prisma's raw exexcution
        await prisma.$executeRaw`
          INSERT INTO user_case_chunks ("id", "caseFileId", "content", "embedding", "createdAt")
          VALUES (
            gen_random_uuid()::text,
            ${caseFileId},
            ${doc.pageContent},
            ${vectorString}::vector,
            NOW()
          );
        `;
      }

      logger.info({ msg: 'Document successfully tokenized and embedded', caseFileId, totalChunks: docs.length });
      return { success: true };
    } catch (error) {
      logger.error({ msg: 'Failed to vectorize user case file', error:(error as Error).message });
      throw error;
    }
}