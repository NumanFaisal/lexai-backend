import { Request, Response } from 'express';
import { processCaseUpload, processUnifiedCaseAnalysis } from './case-analysis.service';
import { AppError } from '../../shared/errors/AppError';

export const uploadCase = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  if (!req.file) throw new AppError('No file uploaded', 400);

  const title = req.body.title || req.file.originalname;

  const result = await processCaseUpload(userId, req.file, title);
  res.status(200).json({ success: true, data: result });
};

export const analyzeCase = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) throw new AppError('Unauthorized', 401);

  const { message, model, caseId } = req.body;

  const result = await processUnifiedCaseAnalysis(userId, message, model, caseId);
  res.status(200).json({ success: true, data: result });
};
