// src/modules/admin/admin.controller.ts
import { Request, Response } from 'express';
import { AdminService } from './admin.service';

export const getDashboardStats = async (req: Request, res: Response) => {
  const stats = await AdminService.getSummaryStats();
  res.status(200).json({ success: true, data: stats });
};

export const listUsers = async (req: Request, res: Response) => {
  const result = await AdminService.findUsers(req.query);
  res.status(200).json({ success: true, data: result });
};

export const getUser = async (req: Request, res: Response) => {
  const user = await AdminService.getUserDetails(req.params.userId);
  res.status(200).json({ success: true, data: user });
};

export const updateUserPlan = async (req: Request, res: Response) => {
  const adminId = req.auth!.userId;
  const { plan, reason } = req.body;
  const result = await AdminService.forceUserPlanOverride(adminId, req.params.userId, plan, reason);
  res.status(200).json({ success: true, data: result });
};

export const suspendUser = async (req: Request, res: Response) => {
  const adminId = req.auth!.userId;
  const { reason } = req.body;
  const result = await AdminService.executeSuspensionToggle(adminId, req.params.userId, true, reason);
  res.status(200).json({ success: true, data: result });
};

export const restoreUser = async (req: Request, res: Response) => {
  const adminId = req.auth!.userId;
  const result = await AdminService.executeSuspensionToggle(adminId, req.params.userId, false, 'Administrative user clearance restore execution.');
  res.status(200).json({ success: true, data: result });
};

export const resetUserQueries = async (req: Request, res: Response) => {
  const adminId = req.auth!.userId;
  const result = await AdminService.forceResetQueries(adminId, req.params.userId);
  res.status(200).json({ success: true, data: result });
};

export const browseQueries = async (req: Request, res: Response) => {
  const result = await AdminService.browseQueries(req.query);
  res.status(200).json({ success: true, data: result });
};

export const getAgentRuns = async (req: Request, res: Response) => {
  const result = await AdminService.browseAgentRuns(req.query);
  res.status(200).json({ success: true, data: result });
};

export const getAdminLogs = async (req: Request, res: Response) => {
  const result = await AdminService.browseAdminLogs(req.query);
  res.status(200).json({ success: true, data: result });
};

export const updateSystemConfig = async (req: Request, res: Response) => {
  const adminId = req.auth!.userId;
  const { value, description } = req.body;
  const result = await AdminService.configureSystemProperty(adminId, req.params.key, value, description);
  res.status(200).json({ success: true, data: result });
};