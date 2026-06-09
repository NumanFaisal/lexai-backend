import prisma from '../../config/db';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import { FileExtractor } from '../../shared/utils/file-extractor';
import { EmbeddingProvider } from '../../ai/embeddings/embeddings.provider';
import { RecursiveCharacterTextSplitter } from '../../shared/utils/text-splitter';
import { runCaseAnalysisPipeline } from '../../ai/pipelines/case-analysis.pipeline';
import { SupportedModel } from '../../config/llm.config';
import { AppError } from '../../shared/errors/AppError';

// 1. Process PDF Upload
export const processCaseUpload = async (userId: string, file: Express.Multer.File, title: string) => {
  // Upload raw file to R2
  const r2Key = `cases/${userId}/${Date.now()}_${file.originalname}`;
  await r2Storage.uploadFile(r2Key, file.buffer, file.mimetype);

  // Extract Text
  const text = await FileExtractor.extractText(file.buffer, file.mimetype, file.originalname);

  // Create Case record
  const caseFile = await prisma.userCaseFile.create({
    data: {
      userId,
      title,
      r2Key,
      fileType: file.mimetype,
    }
  });

  // Chunk & Embed Text
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  
  const chunks = await splitter.createDocuments([text]);
  
  for (const chunk of chunks) {
    const embedding = await EmbeddingProvider.embedText(chunk.pageContent);
    const embeddingString = `[${embedding.join(',')}]`;
    
    // Using queryRaw for pgvector insert
    await prisma.$executeRaw`
      INSERT INTO user_case_chunks (id, "caseFileId", content, embedding, "createdAt")
      VALUES (gen_random_uuid(), ${caseFile.id}, ${chunk.pageContent}, ${embeddingString}::vector, NOW());
    `;
  }

  return { caseId: caseFile.id, title, totalChunks: chunks.length };
};

// 2. Process Unified Case Analysis
export const processUnifiedCaseAnalysis = async (
  userId: string,
  query: string,
  model: SupportedModel,
  caseId?: string
) => {
  if (caseId) {
    // Verify ownership
    const caseFile = await prisma.userCaseFile.findFirst({
      where: { id: caseId, userId }
    });
    if (!caseFile) throw new AppError('Case file not found', 404);
  }

  // Run the full LangGraph pipeline (handles Kanoon fallback, local precedents, and PDF facts)
  return await runCaseAnalysisPipeline({
    query,
    userId,
    caseId,
    selectedModel: model,
    // Note: If you want conversation history in the future, pass it here.
  });
};
