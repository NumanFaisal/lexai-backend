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

  return {
    caseId: caseFile.id,
    title,
    extractedText: text,
    fileUrl: r2Key,
    totalChunks: chunks.length,
  };
};

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
  const pipelineResult = await runCaseAnalysisPipeline({
    query,
    userId,
    caseId,
    selectedModel: model,
  });

  const finalResponse = pipelineResult.finalResponse;

  // Extract applicable laws from verified citations
  const lawsSet = new Set<string>();
  (pipelineResult.citationsVerified || []).forEach((c: any) => {
    const act = c.actName || c.source || c.text;
    if (act) {
      lawsSet.add(c.sectionNum ? `${act} (Section ${c.sectionNum})` : act);
    }
  });

  // Extract common Indian law sections from text if citations set is empty
  if (lawsSet.size === 0) {
    const sectionMatches = finalResponse.match(/(?:Section|Sec\.)\s+\d+[A-Z]?\s+(?:IPC|CrPC|BNS|BNSS|CPC|[A-Za-z]+)/gi);
    if (sectionMatches) {
      sectionMatches.forEach(m => lawsSet.add(m));
    }
  }

  // Extract recommendations from analysis text
  const recommendations: string[] = [];
  const lines = finalResponse.split('\n');
  let inRecSection = false;
  for (const line of lines) {
    if (/Next Steps|Recommendations|Action Plan|Tactical Strategy/i.test(line)) {
      inRecSection = true;
      continue;
    }
    if (inRecSection) {
      if (line.startsWith('#')) break;
      const cleanLine = line.replace(/^[•\-\*\d\.]+\s*/, '').replace(/^[›>]\s*/, '').trim();
      if (cleanLine.length > 5) {
        recommendations.push(cleanLine);
      }
    }
  }

  return {
    analysis: finalResponse,
    response: finalResponse,
    applicableLaws: Array.from(lawsSet),
    recommendations: recommendations.length > 0 ? recommendations : [
      'Review the charge sheet/FIR carefully with legal counsel',
      'Gather documentary evidence and transaction records',
      'Prepare bail/defense application under applicable provisions'
    ],
    citations: pipelineResult.citationsVerified,
    confidenceScore: pipelineResult.confidenceScore,
    confidenceLevel: pipelineResult.confidenceLevel,
    metadata: pipelineResult.metadata,
  };
};
