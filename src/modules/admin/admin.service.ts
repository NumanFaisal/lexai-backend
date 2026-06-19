// src/modules/admin/admin.service.ts
import { AdminRepository } from './admin.repository';
import { prisma } from '../../config/db';
import { AppError } from '../../shared/errors/AppError';
import { Plan, AdminActionType } from '@prisma/client';

export class AdminService {
  static async getSummaryStats() {
    return AdminRepository.getDashboardStats();
  }

  static async findUsers(filters: any) {
    const skip = (filters.page - 1) * filters.limit;
    const { users, total } = await AdminRepository.findUsersPaginated({
      skip,
      take: filters.limit,
      plan: filters.plan,
      persona: filters.persona,
      search: filters.search,
    });

    return {
      users,
      pagination: { total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  static async getUserDetails(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        whatsappSession: true,
        _count: { select: { queries: true, documents: true, complianceReports: true } },
      },
    });
    if (!user) throw new AppError('The requested user account details could not be found.', 404);
    return user;
  }

  static async forceUserPlanOverride(adminId: string, targetUserId: string, newPlan: Plan, reason: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError('Target tenant system record not found.', 404);

    const limits: Record<Plan, number> = { FREE: 30, STUDENT_PLAN: 100, ADVOCATE_PRO: 500, BUSINESS_PLAN: 1500 };
    
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { plan: newPlan, queriesLimit: limits[newPlan] },
    });

    await AdminRepository.logAdminAction({
      adminId,
      targetUserId,
      action: AdminActionType.USER_PLAN_CHANGE,
      reason,
      previousState: { plan: user.plan, limit: user.queriesLimit },
      newState: { plan: updatedUser.plan, limit: updatedUser.queriesLimit },
    });

    return updatedUser;
  }

  static async executeSuspensionToggle(adminId: string, targetUserId: string, suspend: boolean, reason: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError('Target user system record matching ID not found.', 404);

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { isSuspended: suspend, suspendedReason: suspend ? reason : null },
    });

    await AdminRepository.logAdminAction({
      adminId,
      targetUserId,
      action: suspend ? AdminActionType.USER_SUSPENDED : AdminActionType.USER_RESTORED,
      reason,
      previousState: { isSuspended: user.isSuspended },
      newState: { isSuspended: updatedUser.isSuspended },
    });

    return updatedUser;
  }

  static async forceResetQueries(adminId: string, targetUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError('User target record missing.', 404);

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { queriesUsed: 0, planResetDate: new Date() },
    });

    await AdminRepository.logAdminAction({
      adminId,
      targetUserId,
      action: AdminActionType.QUERY_LIMIT_RESET,
      reason: 'Administrative manual consumption quota reset forced.',
      previousState: { queriesUsed: user.queriesUsed },
      newState: { queriesUsed: updatedUser.queriesUsed },
    });

    return updatedUser;
  }

  static async browseQueries(filters: any) {
    const skip = (filters.page - 1) * filters.limit;
    const { queries, total } = await AdminRepository.browseQueriesPaginated({
      skip,
      take: filters.limit,
      mode: filters.mode,
      source: filters.source,
      flagged: filters.flagged,
    });

    return {
      queries,
      pagination: { total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  static async browseAgentRuns(filters: any) {
    const skip = (filters.page - 1) * filters.limit;
    const { runs, total } = await AdminRepository.findAgentRunsPaginated({
      skip,
      take: filters.limit,
      status: filters.status,
      agentType: filters.agentType,
    });

    return {
      runs,
      pagination: { total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  static async browseAdminLogs(filters: any) {
    const skip = (filters.page - 1) * filters.limit;
    const { logs, total } = await AdminRepository.fetchAdminLogs(skip, filters.limit);

    return {
      logs,
      pagination: { total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) },
    };
  }

  static async configureSystemProperty(adminId: string, key: string, value: string, description?: string) {
    const config = await AdminRepository.upsertSystemConfig(key, value, description, adminId);
    
    await AdminRepository.logAdminAction({
      adminId,
      action: AdminActionType.SYSTEM_CONFIG_CHANGED,
      reason: `System runtime parameter modified via setting modification: [${key}]`,
      metadata: { key, updatedValue: value },
    });

    return config;
  }
}