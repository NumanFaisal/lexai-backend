import prisma from '../../config/db';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import { FileExtractor } from '../../shared/utils/file-extractor';
import { EmbeddingProvider } from '../../ai/embeddings/embeddings.provider';
import { AppError } from '../../shared/errors/AppError';
import { RecursiveCharacterTextSplitter } from '../../shared/utils/text-splitter';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { SupportedModel } from '../../config/llm.config';
import { env } from '../../config/env';
import { CASE_ANALYSIS_SYSTEM_PROMPT } from '../../ai/prompts/shared/base.prompt';

export const processCaseUpload = async (userId: string, file: Express.Multer.File, title: string) => {
  // 1. Upload raw file to R2
  const r2Key = `cases/${userId}/${Date.now()}_${file.originalname}`;
  await r2Storage.uploadFile(r2Key, file.buffer, file.mimetype);

  // 2. Extract Text
  const text = await FileExtractor.extractText(file.buffer, file.mimetype, file.originalname);

  // 3. Create Case record
  const caseFile = await prisma.userCaseFile.create({
    data: {
      userId,
      title,
      r2Key,
      fileType: file.mimetype,
    }
  });

  // 4. Chunk & Embed Text
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

export const processCaseQuery = async (userId: string, caseId: string, query: string, model: SupportedModel) => {
  // Verify ownership
  const caseFile = await prisma.userCaseFile.findFirst({
    where: { id: caseId, userId }
  });
  if (!caseFile) throw new AppError('Case file not found', 404);

  // 1. Embed query
  const queryEmbedding = await EmbeddingProvider.embedText(query);
  const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;

  // 2. Vector Search (limit 5)
  const results = await prisma.$queryRaw<Array<{ content: string }>>`
    SELECT content
    FROM user_case_chunks
    WHERE "caseFileId" = ${caseId}
    ORDER BY embedding <=> ${queryEmbeddingString}::vector
    LIMIT 5;
  `;

  const contextText = results.map(r => r.content).join('\n\n');

  // 3. RAG LLM call
  let llm;
  if (model.includes('gpt')) {
    llm = new ChatOpenAI({ modelName: model, openAIApiKey: env.OPENAI_API_KEY });
  } else if (model.includes('gemini')) {
    llm = new ChatGoogleGenerativeAI({ modelName: model, apiKey: env.GOOGLE_API_KEY });
  } else {
    llm = new ChatAnthropic({ modelName: model, anthropicApiKey: env.ANTHROPIC_API_KEY });
  }

  const systemMessage = CASE_ANALYSIS_SYSTEM_PROMPT.replace('{{RAG_CONTEXT}}', contextText);

  const response = await llm.invoke([
    { role: 'system', content: systemMessage },
    { role: 'user', content: query }
  ]);

  return { answer: response.content };
};
