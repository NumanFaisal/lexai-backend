// src/modules/observability/analytics.ts
import { prisma } from '../../config/db';
import { logger } from '../../config/logger';
import { QueryMode, QuerySource } from '@prisma/client';

export class OperationalAnalytics {
  /**
   * Flushes real-time processing counts into daily operational logs using a fast transactional upsert.
   */
  static async logDailyActivity(params: {
    userId: string;
    mode: QueryMode;
    source: QuerySource;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    wordsCount?: number;
    isVoice?: boolean;
    voiceDurationSec?: number;
  }): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      if (params.userId.startsWith('wa_unregistered')) return;

      const whisperCost = params.isVoice ? ((params.voiceDurationSec || 0) / 60) * 0.006 : 0;

      await prisma.usageLog.upsert({
        where: {
          userId_date: { userId: params.userId, date: today },
        },
        create: {
          userId: params.userId,
          date: today,
          researchCount: params.mode === QueryMode.RESEARCH ? 1 : 0,
          draftCount: params.mode === QueryMode.DRAFT ? 1 : 0,
          complianceCount: params.mode === QueryMode.COMPLIANCE ? 1 : 0,
          caseCount: params.mode === QueryMode.CASE_ANALYSIS ? 1 : 0,
          totalCount: 1,
          voiceQueryCount: params.isVoice ? 1 : 0,
          voiceMinutes: params.isVoice ? (params.voiceDurationSec || 0) / 60 : 0,
          webCount: params.source === QuerySource.WEB ? 1 : 0,
          whatsappCount: params.source === QuerySource.WHATSAPP ? 1 : 0,
          claudeCostUsd: params.costUsd,
          whisperCostUsd: whisperCost,
          draftingWordsUsed: params.wordsCount || 0,
        },
        update: {
          researchCount: params.mode === QueryMode.RESEARCH ? { increment: 1 } : undefined,
          draftCount: params.mode === QueryMode.DRAFT ? { increment: 1 } : undefined,
          complianceCount: params.mode === QueryMode.COMPLIANCE ? { increment: 1 } : undefined,
          caseCount: params.mode === QueryMode.CASE_ANALYSIS ? { increment: 1 } : undefined,
          totalCount: { increment: 1 },
          voiceQueryCount: params.isVoice ? { increment: 1 } : undefined,
          voiceMinutes: params.isVoice ? { increment: params.voiceDurationSec ? params.voiceDurationSec / 60 : 0 } : undefined,
          webCount: params.source === QuerySource.WEB ? { increment: 1 } : undefined,
          whatsappCount: params.source === QuerySource.WHATSAPP ? { increment: 1 } : undefined,
          claudeCostUsd: { increment: params.costUsd },
          whisperCostUsd: { increment: whisperCost },
          draftingWordsUsed: params.wordsCount ? { increment: params.wordsCount } : undefined,
        },
      });
    } catch (error) {
      logger.error({ msg: 'Analytics engine ingestion failed to commit to DB', error: (error as Error).message });
    }
  }
}