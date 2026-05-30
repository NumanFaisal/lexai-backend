// src/modules/chat/chat.controller.ts
import { Request, Response } from 'express';
import { fetchUserChatHistory, processResearchQuery, fetchUserConversations, fetchConversationDetails } from './chat.service';

export const handleResearchChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // We trust req.body here because the Zod middleware validated it
  const { message, model } = req.body; 

  const result = await processResearchQuery(userId, message, model);

  res.status(200).json({
    success: true,
    data: result
  });
};

export const getChatHistory = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const history = await fetchUserChatHistory(userId);

  res.status(200).json({
    success: true,
    count: history.length,
    data: history
  });
};

export const getConversations = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await fetchUserConversations(userId, page, limit);

  res.status(200).json({
    success: true,
    data: result.conversations,
    pagination: result.pagination,
  });
};

export const getConversation = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const conversationId = req.params.id;
  const conversation = await fetchConversationDetails(userId, conversationId);

  res.status(200).json({
    success: true,
    data: conversation,
  });
};