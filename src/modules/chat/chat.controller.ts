// src/modules/chat/chat.controller.ts
import { Request, Response } from 'express';
import {
  fetchUserChatHistory,
  processResearchQuery,
  processCaseAnalysisQuery,
  processComplianceQuery,
  processDraftingQuery,
  fetchUserConversations,
  fetchConversationDetails,
  processDraftingEdit,
} from './chat.service';

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH
// ─────────────────────────────────────────────────────────────────────────────

export const handleResearchChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { message, model } = req.body;
  const result = await processResearchQuery(userId, message, model);

  res.status(200).json({ success: true, data: result });
};

// ─────────────────────────────────────────────────────────────────────────────
// CASE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export const handleCaseAnalysisChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { message, model } = req.body;
  const result = await processCaseAnalysisQuery(userId, message, model);

  res.status(200).json({ success: true, data: result });
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────

export const handleComplianceChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { businessType, state, headcount, revenueBracket, hasUserData, isFood, isFintech, model } = req.body;

  const result = await processComplianceQuery(userId, {
    businessType,
    state,
    headcount,
    revenueBracket,
    hasUserData,
    isFood,
    isFintech,
  }, model);

  res.status(200).json({ success: true, data: result });
};

// ─────────────────────────────────────────────────────────────────────────────
// DRAFTING
// ─────────────────────────────────────────────────────────────────────────────

export const handleDraftingChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { documentType, parties, jurisdiction, context, governingLaw, saveDocument, model } = req.body;

  const result = await processDraftingQuery(userId, {
    documentType,
    parties,
    jurisdiction,
    context,
    governingLaw,
    saveDocument,
  }, model);

  res.status(200).json({ success: true, data: result });
};

export const handleDraftingEdit = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  
  const instruction = req.body.instruction || 'Edit this document';
  const model = req.body.model || 'claude-3-5-sonnet';
  
  const result = await processDraftingEdit(userId, req.file, instruction, model);
  res.status(200).json({ success: true, data: result });
};

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY & CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getChatHistory = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const history = await fetchUserChatHistory(userId);
  res.status(200).json({ success: true, count: history.length, data: history });
};

export const getConversations = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const page  = parseInt(req.query.page  as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  const result = await fetchUserConversations(userId, page, limit);
  res.status(200).json({ success: true, data: result.conversations, pagination: result.pagination });
};

export const getConversation = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const conversationId = req.params.id as string;
  const conversation   = await fetchConversationDetails(userId, conversationId);

  res.status(200).json({ success: true, data: conversation });
};