// src/ai/agents/compliance/compliance.agent.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Compliance Agent
//
// Wraps the compliance LangGraph pipeline with:
// - Redis caching (24 hour TTL — compliance obligations rarely change)
// - DB persistence (ComplianceReport + ComplianceItem records)
// - Structured response mapping to DB enums
// ─────────────────────────────────────────────────────────────────────────────

import { BaseAgent } from '../base.agent';
import {
  runCompliancePipeline,
  ComplianceResult,
  BusinessProfile,
  ComplianceChecklistItem,
} from '../../pipelines/compliance.pipeline';
import { prisma } from '../../../config/db';
import { SupportedModel } from '../../../config/llm.config';
import { logger } from '../../../config/logger';
import { ComplianceCategory, CompliancePriority } from '@prisma/client';

const CACHE_TTL_SECONDS = 86_400; // 24 hours — compliance law changes rarely

export interface ComplianceAgentInput {
  businessProfile: BusinessProfile;
  userId:          string;
  model?:          SupportedModel;
}

export interface ComplianceAgentOutput {
  reportId:        string;
  title:           string;
  summary:         string;
  items:           ComplianceChecklistItem[];
  totalItems:      number;
  urgentCount:     number;
  confidenceScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  latencyMs:       number;
  fromCache:       boolean;
  response?:       string;
}

// Map LLM string categories → Prisma enum
function mapCategory(cat: string): ComplianceCategory {
  const map: Record<string, ComplianceCategory> = {
    TAX:            ComplianceCategory.TAX,
    LABOUR:         ComplianceCategory.LABOUR,
    DATA_PRIVACY:   ComplianceCategory.DATA_PRIVACY,
    CORPORATE:      ComplianceCategory.CORPORATE,
    STATE_SPECIFIC: ComplianceCategory.STATE_SPECIFIC,
    SECTOR_SPECIFIC: ComplianceCategory.SECTOR_SPECIFIC,
    ENVIRONMENTAL:  ComplianceCategory.ENVIRONMENTAL,
  };
  return map[cat?.toUpperCase()] ?? ComplianceCategory.CORPORATE;
}

// Map LLM priority strings → Prisma enum
function mapPriority(priority: string): CompliancePriority {
  const map: Record<string, CompliancePriority> = {
    URGENT:         CompliancePriority.URGENT,
    THIS_QUARTER:   CompliancePriority.THIS_QUARTER,
    OPTIONAL:       CompliancePriority.OPTIONAL,
    NOT_APPLICABLE: CompliancePriority.NOT_APPLICABLE,
  };
  return map[priority?.toUpperCase()] ?? CompliancePriority.THIS_QUARTER;
}

export class ComplianceAgent extends BaseAgent {
  constructor() {
    super('COMPLIANCE');
  }

  async run(input: ComplianceAgentInput): Promise<ComplianceAgentOutput> {
    this.startTimer();

    const { businessProfile, userId, model = 'gpt-4o' } = input;

    // ── Step 1: Check Redis cache ──────────────────────────────────────────
    const cacheKey = this.buildCacheKey(
      userId,
      `${businessProfile.businessType}|${businessProfile.state}|${businessProfile.headcount}`
    );
    const cached = await this.getCachedResult<ComplianceAgentOutput>(cacheKey);

    if (cached) {
      logger.info({ msg: '[ComplianceAgent] Cache hit', userId, cacheKey });
      return { ...cached, fromCache: true, latencyMs: this.getLatency() };
    }

    // ── Step 2: Run compliance pipeline ───────────────────────────────────
    logger.info({ msg: '[ComplianceAgent] Cache miss — running pipeline', userId, model });

    const result: ComplianceResult = await runCompliancePipeline({
      businessProfile,
      userId,
      selectedModel: model,
    });

    // ── Step 3: Persist to ComplianceReport + ComplianceItem DB tables ────
    const reportId = await this.saveComplianceReport(userId, businessProfile, result);

    // Format compliance checklist as markdown for query response
    let markdownResponse = `### Compliance Audit Checklist\n\n${result.checklist.summary}\n\n`;
    result.checklist.items.forEach((item: any) => {
      markdownResponse += `\n**[${item.priority || 'INFO'}] ${item.title || 'Obligation'}**\n`;
      markdownResponse += `* **Law**: ${item.law || 'N/A'}${item.section ? ` (Section ${item.section})` : ''}\n`;
      markdownResponse += `* **Requirement**: ${item.requirement || 'N/A'}\n`;
      if (item.deadline) markdownResponse += `* **Deadline**: ${item.deadline}\n`;
      if (item.penalty) markdownResponse += `* **Penalty**: ${item.penalty}\n`;
      if (item.action) markdownResponse += `* **Action Required**: ${item.action}\n`;
    });
    if (result.checklist.disclaimer) {
      markdownResponse += `\n\n_${result.checklist.disclaimer}_`;
    }

    // ── Step 4: Also save as a Query record for chat history ──────────────
    await this.saveQuery({
      userId,
      inputText:       `Compliance check: ${businessProfile.businessType}, ${businessProfile.state}, ${businessProfile.headcount} employees`,
      response:        markdownResponse,
      mode:            'COMPLIANCE',
      confidenceScore: result.confidenceScore,
      latencyMs:       this.getLatency(),
    });

    // ── Step 5: Build output and cache ────────────────────────────────────
    const urgentCount = result.checklist.items.filter(i => i.priority === 'URGENT').length;

    const output: ComplianceAgentOutput = {
      reportId,
      title:           result.checklist.title,
      summary:         result.checklist.summary,
      items:           result.checklist.items,
      totalItems:      result.checklist.items.length,
      urgentCount,
      confidenceScore: result.confidenceScore,
      confidenceLevel: result.confidenceLevel,
      latencyMs:       this.getLatency(),
      fromCache:       false,
      response:        markdownResponse,
    };

    await this.setCachedResult(cacheKey, output, CACHE_TTL_SECONDS);

    return output;
  }

  /**
   * Saves the compliance report and its items to PostgreSQL.
   * Returns the report ID.
   */
  private async saveComplianceReport(
    userId: string,
    profile: BusinessProfile,
    result: ComplianceResult
  ): Promise<string> {
    try {
      const urgentCount     = result.checklist.items.filter(i => i.priority === 'URGENT').length;
      const totalItems      = result.checklist.items.length;

      const report = await prisma.complianceReport.create({
        data: {
          userId,
          businessType:  profile.businessType,
          state:         profile.state,
          headcount:     profile.headcount,
          revenueBracket: profile.revenueBracket ?? '',
          hasUserData:   profile.hasUserData  ?? false,
          isFood:        profile.isFood       ?? false,
          isFintech:     profile.isFintech     ?? false,
          title:         result.checklist.title,
          totalItems,
          urgentCount,
          items: {
            create: result.checklist.items.map((item: ComplianceChecklistItem) => ({
              category:    mapCategory(item.category),
              priority:    mapPriority(item.priority),
              title:       item.title,
              law:         item.law,
              section:     item.section     ?? null,
              requirement: item.requirement,
              deadline:    item.deadline    ?? null,
              penalty:     item.penalty     ?? null,
              action:      item.action      ?? null,
            })),
          },
        },
        select: { id: true },
      });

      logger.info({ msg: '[ComplianceAgent] Report saved', reportId: report.id, totalItems });
      return report.id;
    } catch (err) {
      logger.error({ msg: '[ComplianceAgent] Failed to save compliance report', error: (err as Error).message });
      return 'save-failed';
    }
  }
}

// Singleton
export const complianceAgent = new ComplianceAgent();
