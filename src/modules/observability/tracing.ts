// src/modules/observability/tracing.ts
import { prisma } from '../../config/db';
import { logger } from '../../config/logger';
import { QueryMode, AgentRunStatus } from '@prisma/client';

export interface TraceStep {
  step: string;
  status: 'ok' | 'failed';
  durationMs: number;
  tokens?: number;
  metadata?: Record<string, any>;
}

export class PipelineTracer {
  private runId: string | null = null;
  private userId: string;
  private agentType: QueryMode;
  private startTime: number;
  private steps: TraceStep[] = [];

  constructor(userId: string, agentType: QueryMode) {
    this.userId = userId;
    this.agentType = agentType;
    this.startTime = Date.now();
  }

  
  // Initializes an asynchronous trace record within the database
  async start(inputSummary: string): Promise<string> {
    try {
      if (this.userId.startsWith('wa_unregistered')) {
        return 'skipped-unregistered';
      }

      const run = await prisma.agentRun.create({
        data: {
          userId: this.userId,
          agentType: this.agentType,
          status: AgentRunStatus.RUNNING,
          inputSummary: inputSummary.slice(0, 200),
          steps: [] as any,
        },
        select: { id: true }
      });
      this.runId = run.id;
      return run.id;
    } catch (error) {
      logger.error({ msg: 'Failed to initialize tracer block', error: (error as Error).message });
      return 'trace-failed';
    }
  }

  // Appends an isolated step execution segment to the current pipeline trace window
  recordStep(step: string, status: 'ok' | 'failed', durationMs: number, tokens?: number, metadata?: Record<string, any>): void {
    this.steps.push({ step, status, durationMs, tokens, metadata });
    logger.debug({ msg: `[Tracer] Step recorded: ${step}`, durationMs, status });
  }

  
  // Finalizes the execution log, writing the aggregated metadata back to PostgreSQL.
  async finalize(status: AgentRunStatus, tokensIn: number, tokensOut: number, costUsd: number, errorMessage?: string, errorStack?: string): Promise<void> {
    if (!this.runId || this.runId === 'skipped-unregistered' || this.runId === 'trace-failed') return;

    try {
      const totalDurationMs = Date.now() - this.startTime;
      await prisma.agentRun.update({
        where: { id: this.runId },
        data: {
          status,
          steps: this.steps as any,
          totalDurationMs,
          claudeTokensIn: tokensIn,
          claudeTokensOut: tokensOut,
          claudeCostUsd: costUsd,
          errorMessage: errorMessage || null,
          errorStack: errorStack || null,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error({ msg: 'Failed to finalize tracer execution telemetry', error: (error as Error).message });
    }
  }
}