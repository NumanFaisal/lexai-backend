// src/ai/agents/drafting/drafting.agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Drafting Agent
//
// Wraps the drafting LangGraph pipeline with:
// - Redis caching (30 min TTL)
// - Auto-save to Document DB table (status = DRAFT)
// - Structured response with document ID for frontend use
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from '../base.agent';
import {
  runDraftingPipeline,
  DraftingResult,
  DraftingInput,
} from '../../pipelines/drafting.pipeline';
import { prisma } from '../../../config/db';
import { SupportedModel } from '../../../config/llm.config';
import { logger } from '../../../config/logger';
import { DocumentType } from '@prisma/client';
import { LegalDocumentRenderer } from '../../../modules/workers/legalPdfRenderer';
import { r2Storage } from '../../../infrastructure/storage/r2.storage';
import fs from 'fs/promises';
import path from 'path';

const CACHE_TTL_SECONDS = 1800; // 30 minutes — users iterate on drafts

export interface DraftingAgentInput {
  draftingInput: DraftingInput;
  userId:        string;
  model?:        SupportedModel;
  saveDocument?: boolean; // Whether to auto-save to Document table (default: true)
}

export interface DraftingAgentOutput {
  queryId:         string;
  documentId?:     string;    // Set if saveDocument = true
  pdfUrl?:         string;    // Path to R2 bucket file
  pdfDownloadUrl?: string;    // Secure signed download URL
  content:         string;
  documentType:    string;
  structureValid:  boolean;
  missingStructure: string[];
  confidenceScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  latencyMs:       number;
  fromCache:       boolean;
}

// Map string document type to Prisma DocumentType enum
function mapDocumentType(docType: string): DocumentType {
  const map: Record<string, DocumentType> = {
    'nda':                   DocumentType.NDA,
    'non-disclosure':        DocumentType.NDA,
    'bail application':      DocumentType.BAIL_APPLICATION,
    'bail':                  DocumentType.BAIL_APPLICATION,
    'legal notice':          DocumentType.LEGAL_NOTICE,
    'notice':                DocumentType.LEGAL_NOTICE,
    'employment agreement':  DocumentType.EMPLOYMENT_AGREEMENT,
    'employment contract':   DocumentType.EMPLOYMENT_AGREEMENT,
    'freelancer agreement':  DocumentType.FREELANCER_AGREEMENT,
    'freelance contract':    DocumentType.FREELANCER_AGREEMENT,
    'rent agreement':        DocumentType.RENT_AGREEMENT,
    'lease agreement':       DocumentType.RENT_AGREEMENT,
    'co-founder agreement':  DocumentType.CO_FOUNDER_AGREEMENT,
    'cofounder agreement':   DocumentType.CO_FOUNDER_AGREEMENT,
    'consumer complaint':    DocumentType.CONSUMER_COMPLAINT,
    'vakalatnama':           DocumentType.VAKALATNAMA,
    'written statement':     DocumentType.WRITTEN_STATEMENT,
    'sale deed':             DocumentType.SALE_DEED,
    'partnership deed':      DocumentType.PARTNERSHIP_DEED,
    'power of attorney':     DocumentType.POWER_OF_ATTORNEY,
    'poa':                   DocumentType.POWER_OF_ATTORNEY,
    'affidavit':             DocumentType.AFFIDAVIT,
  };

  const normalized = docType.toLowerCase().trim();
  return map[normalized] ?? DocumentType.OTHER;
}

export class DraftingAgent extends BaseAgent {
  constructor() {
    super('DRAFT');
  }

  async run(input: DraftingAgentInput): Promise<DraftingAgentOutput> {
    this.startTimer();

    const { draftingInput, userId, model = 'gpt-4o', saveDocument = true } = input;

    // ── Step 1: Check Redis cache ──────────────────────────────────────────
    const cacheKey = this.buildCacheKey(
      userId,
      `${draftingInput.documentType}|${draftingInput.parties.map(p => p.name).join('|')}|${draftingInput.jurisdiction}`
    );
    const cached = await this.getCachedResult<DraftingAgentOutput>(cacheKey);

    if (cached) {
      logger.info({ msg: '[DraftingAgent] Cache hit', userId, cacheKey });
      return { ...cached, fromCache: true, latencyMs: this.getLatency() };
    }

    // ── Step 2: Run drafting pipeline ─────────────────────────────────────
    logger.info({ msg: '[DraftingAgent] Cache miss — running pipeline', userId, model });

    // Convert draftingInput to a query string for the pipeline
    const query = `Draft a ${draftingInput.documentType}.
Jurisdiction: ${draftingInput.jurisdiction}.
Parties:
${draftingInput.parties.map(p => `- ${p.name} (${p.role})${p.address ? ` residing at ${p.address}` : ''}`).join('\n')}
${draftingInput.context ? `Context/Instructions:\n${draftingInput.context}` : ''}`;

    const result: DraftingResult = await runDraftingPipeline({
      query,
      userId,
      selectedModel: model,
    });

    if (result.type === 'CLARIFICATION_NEEDED') {
      // ── Step 3: Save Query record (for clarification) ────────────────────
      const saved = await this.saveQuery({
        userId,
        inputText:         `Draft ${draftingInput.documentType} for ${draftingInput.parties.map(p => p.name).join(' & ')}`,
        response:          result.clarificationQuestion,
        mode:              'DRAFT',
        confidenceScore:   1.0,
        citationsVerified: [],
        latencyMs:         this.getLatency(),
        promptTokens:      result.metadata.totalInputTokens,
        responseTokens:    result.metadata.totalOutputTokens,
      });

      const output: DraftingAgentOutput = {
        queryId:          saved.id,
        content:          result.clarificationQuestion,
        documentType:     draftingInput.documentType,
        structureValid:   false,
        missingStructure: [result.clarificationQuestion],
        confidenceScore:  1.0,
        confidenceLevel:  'HIGH',
        latencyMs:        this.getLatency(),
        fromCache:        false,
      };

      await this.setCachedResult(cacheKey, output, CACHE_TTL_SECONDS);
      return output;
    }

    // result.type === "DRAFT_READY"
    // ── Step 3: Save Query record ─────────────────────────────────────────
    const saved = await this.saveQuery({
      userId,
      inputText:         `Draft ${draftingInput.documentType} for ${draftingInput.parties.map(p => p.name).join(' & ')}`,
      response:          result.draftedContent.slice(0, 2000), // Store first 2KB of draft
      mode:              'DRAFT',
      confidenceScore:   result.compliancePassed ? 1.0 : 0.7,
      citationsVerified: [],
      latencyMs:         this.getLatency(),
      promptTokens:      result.metadata.totalInputTokens,
      responseTokens:    result.metadata.totalOutputTokens,
    });

    // ── Step 4: Auto-save Document record ─────────────────────────────────
    let documentId: string | undefined;
    let pdfUrl: string | undefined;
    let pdfDownloadUrl: string | undefined;
    if (saveDocument) {
      const docRecord = await this.saveDocumentRecord(userId, draftingInput, result, saved.id);
      if (docRecord) {
        documentId = docRecord.id;
        pdfUrl = docRecord.pdfUrl;
        pdfDownloadUrl = docRecord.pdfDownloadUrl;
      }
    }

    // ── Step 5: Build output and cache ────────────────────────────────────
    const output: DraftingAgentOutput = {
      queryId:          saved.id,
      documentId,
      pdfUrl,
      pdfDownloadUrl,
      content:          result.draftedContent,
      documentType:     draftingInput.documentType,
      structureValid:   result.compliancePassed,
      missingStructure: result.documentDetails.missingFields ?? [],
      confidenceScore:  result.compliancePassed ? 1.0 : 0.7,
      confidenceLevel:  result.compliancePassed ? 'HIGH' : 'MEDIUM',
      latencyMs:        this.getLatency(),
      fromCache:        false,
    };

    await this.setCachedResult(cacheKey, output, CACHE_TTL_SECONDS);

    return output;
  }

  /**
   * Saves the generated document to the Document table.
   * Returns the document ID, pdfUrl, and pdfDownloadUrl, or undefined on failure.
   */
  private async saveDocumentRecord(
    userId:       string,
    input:        DraftingInput,
    result:       Extract<DraftingResult, { type: 'DRAFT_READY' }>,
    queryId:      string
  ): Promise<{ id: string; pdfUrl?: string; pdfDownloadUrl?: string } | undefined> {
    try {
      const docType  = mapDocumentType(input.documentType);
      const title    = `${input.documentType} — ${input.parties.map(p => p.name).join(' & ')}`;

      const doc = await prisma.document.create({
        data: {
          userId,
          queryId,
          type:         docType,
          title,
          status:       'DRAFT',
          content:      result.draftedContent,
          parties:      input.parties as any,
          jurisdiction: input.jurisdiction,
          governingLaw: input.governingLaw ?? result.documentDetails.governingLaw ?? 'Indian Contract Act 1872',
          version:      1,
        },
        select: { id: true },
      });

      logger.info({ msg: '[DraftingAgent] Document saved, rendering PDF...', documentId: doc.id, userId });

      let r2Key: string | undefined;
      let pdfDownloadUrl: string | undefined;

      try {
        const tempFilePath = path.join(__dirname, `temp_${doc.id}.pdf`);
        const renderer = new LegalDocumentRenderer(docType, tempFilePath);
        await renderer.render(result.draftedContent);

        const pdfBuffer = await fs.readFile(tempFilePath);
        await fs.unlink(tempFilePath).catch(() => {});

        r2Key = `users/${userId}/documents/${doc.id}_${title.replace(/\s+/g, '_')}.pdf`;
        await r2Storage.uploadFile(r2Key, pdfBuffer, 'application/pdf');

        await prisma.document.update({
          where: { id: doc.id },
          data: { pdfUrl: r2Key, pdfGeneratedAt: new Date() }
        });

        pdfDownloadUrl = await r2Storage.getSignedDownloadUrl(r2Key, 3600);
        logger.info({ msg: '[DraftingAgent] PDF generated and uploaded successfully', documentId: doc.id });
      } catch (pdfErr) {
        logger.error({ msg: '[DraftingAgent] Failed to generate/upload PDF for document', documentId: doc.id, error: (pdfErr as Error).message });
      }

      return {
        id: doc.id,
        pdfUrl: r2Key,
        pdfDownloadUrl,
      };
    } catch (err) {
      logger.error({ msg: '[DraftingAgent] Failed to save Document record', error: (err as Error).message });
      return undefined;
    }
  }
}

// Singleton
export const draftingAgent = new DraftingAgent();
