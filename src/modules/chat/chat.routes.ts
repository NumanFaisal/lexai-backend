// src/modules/chat/chat.routes.ts
import { Router } from 'express';
import express from 'express';
import { getChatHistory, handleResearchChat, getConversations, getConversation } from './chat.controller';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { researchChatSchema } from './chat.schema';
import { aiRateLimiter } from '@/shared/middleware/rate-limit.middleware';

const router = Router();

// POST /api/v1/chat/research
router.post(
  '/research',
  express.json(),
  requireAuth,                  // 1. Ensure user is logged in via Clerk
  aiRateLimiter,              // 2. Rate limit AI queries
  validate(researchChatSchema), // 2. Ensure message is valid
  asyncHandler(handleResearchChat)// 3. Run the AI
);


router.get(
  '/history',
  requireAuth,                 // 1. Ensure user is logged in
  aiRateLimiter,
  asyncHandler(getChatHistory) // 2. Fetch and return history
);

// GET /api/v1/chat/conversations
router.get(
  '/conversations',
  requireAuth,
  asyncHandler(getConversations)
);

// GET /api/v1/chat/conversations/:id
router.get(
  '/conversations/:id',
  requireAuth,
  asyncHandler(getConversation)
);

export default router;