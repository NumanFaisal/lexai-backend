// src/modules/admin/admin.repository.ts
import { prisma } from '../../config/db';
import { Plan, Persona, QueryMode, QuerySource, AgentRunStatus, AdminActionType } from '@prisma/client';

export class AdminRepository {
  static async logAdminAction(params: {
    adminId: string;
    targetUserId?: string;
    action: AdminActionType;
    reason?: string;
    metadata?: any;
    previousState?: any;
    newState?: any;
  }) {
    return prisma.adminLog.create({
      data: {
        adminId: params.adminId,
        targetUserId: params.targetUserId || null,
        action: params.action,
        reason: params.reason || null,
        metadata: params.metadata || {},
        previousState: params.previousState || {},
        newState: params.newState || {},
      },
    });
  }

  static async getDashboardStats() {
    const [
      totalUsers,
      totalQueries,
      totalCost,
      flaggedCitations,
      revenueInPaise
    ] = await Promise.all([
      prisma.user.count(),
      prisma.query.count(),
      prisma.query.aggregate({ _sum: { totalTokens: true } }),
      prisma.query.count({ where: { hallucinationFlagged: true } }),
      prisma.subscription.aggregate({ _sum: { amountInPaise: true }, where: { status: 'ACTIVE' } })
    ]);

    return {
      users: { total: totalUsers },
      queries: { total: totalQueries, flaggedHallucinations: flaggedCitations },
      metrics: { totalTokensConsumed: totalCost._sum.totalTokens || 0 },
      financials: { activeArrEstimatedINR: ((revenueInPaise._sum.amountInPaise || 0) / 100) },
    };
  }

  static async findUsersPaginated(filters: {
    skip: number;
    take: number;
    plan?: Plan;
    persona?: Persona;
    search?: string;
  }) {
    const whereClause: any = {
      ...(filters.plan && { plan: filters.plan }),
      ...(filters.persona && { persona: filters.persona }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { whatsappPhone: { contains: filters.search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        skip: filters.skip,
        take: filters.take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, plan: true, persona: true, whatsappLinked: true, isActive: true, isSuspended: true, createdAt: true },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    return { users, total };
  }

  static async browseQueriesPaginated(filters: {
    skip: number;
    take: number;
    mode?: QueryMode;
    source?: QuerySource;
    flagged?: boolean;
  }) {
    const where: any = {
      ...(filters.mode && { mode: filters.mode }),
      ...(filters.source && { source: filters.source }),
      ...(filters.flagged !== undefined && { hallucinationFlagged: filters.flagged }),
    };

    const [queries, total] = await Promise.all([
      prisma.query.findMany({
        where,
        skip: filters.skip,
        take: filters.take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.query.count({ where }),
    ]);

    return { queries, total };
  }

  static async findAgentRunsPaginated(filters: {
    skip: number;
    take: number;
    status?: AgentRunStatus;
    agentType?: QueryMode;
  }) {
    const where: any = {
      ...(filters.status && { status: filters.status }),
      ...(filters.agentType && { agentType: filters.agentType }),
    };

    const [runs, total] = await Promise.all([
      prisma.agentRun.findMany({
        where,
        skip: filters.skip,
        take: filters.take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.agentRun.count({ where }),
    ]);

    return { runs, total };
  }

  static async fetchAdminLogs(skip: number, take: number) {
    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { targetUser: { select: { name: true, email: true } } },
      }),
      prisma.adminLog.count(),
    ]);

    return { logs, total };
  }

  static async upsertSystemConfig(key: string, value: string, description?: string, adminId?: string) {
    return prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description, updatedBy: adminId },
      update: { value, ...(description && { description }), updatedBy: adminId },
    });
  }
}