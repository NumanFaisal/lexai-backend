// src/modules/admin/admin.schema.ts
import { z } from 'zod';
import { Plan, Persona, QueryMode, QuerySource, AgentRunStatus } from '@prisma/client';

const pagination = {
  page: z.string().optional().transform(v => parseInt(v || '1', 10)),
  limit: z.string().optional().transform(v => parseInt(v || '20', 10)),
};

export const listUsersSchema = z.object({
  query: z.object({
    ...pagination,
    plan: z.nativeEnum(Plan).optional(),
    persona: z.nativeEnum(Persona).optional(),
    search: z.string().optional(),
  }),
});

export const updatePlanSchema = z.object({
  params: z.object({ userId: z.string() }),
  body: z.object({
    plan: z.nativeEnum(Plan, { error: "Invalid system Plan profile string." }),
    reason: z.string().min(5, "A meaningful descriptive override reason is mandatory."),
  }),
});

export const suspendUserSchema = z.object({
  params: z.object({ userId: z.string() }),
  body: z.object({
    reason: z.string().min(5, "A reason statement is mandatory to suspend a tenant."),
  }),
});

export const adminActionUserSchema = z.object({
  params: z.object({ userId: z.string() }),
});

export const browseQueriesSchema = z.object({
  query: z.object({
    ...pagination,
    mode: z.nativeEnum(QueryMode).optional(),
    source: z.nativeEnum(QuerySource).optional(),
    flagged: z.string().optional().transform(v => v === 'true'),
  }),
});

export const getAgentRunsSchema = z.object({
  query: z.object({
    ...pagination,
    status: z.nativeEnum(AgentRunStatus).optional(),
    agentType: z.nativeEnum(QueryMode).optional(),
  }),
});

export const getAdminLogsSchema = z.object({
  query: z.object(pagination),
});

export const updateConfigSchema = z.object({
  params: z.object({ key: z.string() }),
  body: z.object({
    value: z.string().min(1, "Config values cannot be empty strings"),
    description: z.string().optional(),
  }),
});