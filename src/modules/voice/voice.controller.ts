import { Request, Response } from 'express';
import { fetchUserTranscriptions } from './voice.service';

export const getTranscriptions = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await fetchUserTranscriptions(userId, page, limit);
  res.status(200).json({ success: true, ...result });
};