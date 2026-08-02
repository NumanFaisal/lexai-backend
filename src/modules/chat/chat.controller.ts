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
  processVoiceInput,
  deleteConversation,
} from './chat.service';

import { GroqProvider } from '../../ai/providers/groq.provider';


// RESEARCH


export const handleResearchChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { message, model, conversationId } = req.body;
  const result = await processResearchQuery(userId, message, model, conversationId);

  res.status(200).json({ success: true, data: result });
};


// CASE ANALYSIS

export const handleCaseAnalysisChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { message, model, conversationId } = req.body;
  const result = await processCaseAnalysisQuery(userId, message, model, conversationId);

  res.status(200).json({ success: true, data: result });
};


// COMPLIANCE

export const handleComplianceChat = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { businessType, state, headcount, revenueBracket, hasUserData, isFood, isFintech, model, conversationId } = req.body;

  const result = await processComplianceQuery(userId, {
    businessType,
    state,
    headcount,
    revenueBracket,
    hasUserData,
    isFood,
    isFintech,
  }, model, conversationId);

  res.status(200).json({ success: true, data: result });
};


// DRAFTING

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


// HISTORY & CONVERSATIONS

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

export const handleVoiceInput = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  if (!req.file) return res.status(400).json({ success: false, message: 'No audio file uploaded' });

  const result = await processVoiceInput(
    userId,
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  res.status(200).json({ success: true, data: result });
};

export const handleGenerateTitle = async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, message: 'Prompt is required' });
  }

  const title = await GroqProvider.generateTitle(prompt);
  res.status(200).json({ success: true, data: { title } });
};

export const handleDeleteConversation = async (req: Request, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const conversationId = req.params.id as string;
  const result = await deleteConversation(conversationId, userId);

  res.status(200).json({ success: true, data: result });
};