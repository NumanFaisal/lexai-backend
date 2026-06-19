// src/modules/admin/admin.routes.ts
import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import * as schema from './admin.schema';
import * as ctrl from './admin.controller';

const router = Router();

router.use(express.json());
router.use(requireAuth);

// 1. Dashboard Stats
router.get('/stats', asyncHandler(ctrl.getDashboardStats));

// 2. User Administration Operations
router.get('/users', validate(schema.listUsersSchema), asyncHandler(ctrl.listUsers));
router.get('/users/:userId', validate(schema.adminActionUserSchema), asyncHandler(ctrl.getUser));
router.patch('/users/:userId/plan', validate(schema.updatePlanSchema), asyncHandler(ctrl.updateUserPlan));
router.post('/users/:userId/suspend', validate(schema.suspendUserSchema), asyncHandler(ctrl.suspendUser));
router.post('/users/:userId/restore', validate(schema.adminActionUserSchema), asyncHandler(ctrl.restoreUser));
router.post('/users/:userId/reset-queries', validate(schema.adminActionUserSchema), asyncHandler(ctrl.resetUserQueries));

// 3. System Telemetry Browsing
router.get('/queries', validate(schema.browseQueriesSchema), asyncHandler(ctrl.browseQueries));
router.get('/agent-runs', validate(schema.getAgentRunsSchema), asyncHandler(ctrl.getAgentRuns));
router.get('/logs', validate(schema.getAdminLogsSchema), asyncHandler(ctrl.getAdminLogs));

// 4. Runtime Properties Override Configuration
router.patch('/config/:key', validate(schema.updateConfigSchema), asyncHandler(ctrl.updateSystemConfig));

export default router;