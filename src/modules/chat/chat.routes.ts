// src/modules/chat/chat.routes.ts
import { Router } from 'express';
import express from 'express';
import {
  getChatHistory,
  handleResearchChat,
  handleCaseAnalysisChat,
  handleComplianceChat,
  handleDraftingChat,
  getConversations,
  getConversation,
} from './chat.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import multer from 'multer';
import { validate } from '../../shared/middleware/validate.middleware';
import {
  researchChatSchema,
  caseAnalysisChatSchema,
  complianceChatSchema,
  draftingChatSchema,
} from './chat.schema';
import { aiRateLimiter } from '@/shared/middleware/rate-limit.middleware';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/chat/research
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/research',
  express.json(),
  requireAuth,
  aiRateLimiter,
  validate(researchChatSchema),
  asyncHandler(handleResearchChat)
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/chat/case-analysis
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/case-analysis',
  express.json(),
  requireAuth,
  aiRateLimiter,
  validate(caseAnalysisChatSchema),
  asyncHandler(handleCaseAnalysisChat)
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/chat/compliance
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/compliance',
  express.json(),
  requireAuth,
  aiRateLimiter,
  validate(complianceChatSchema),
  asyncHandler(handleComplianceChat)
);

// ─────────────────────────────────────────────────────────────────────────────
// DRAFTING
// ─────────────────────────────────────────────────────────────────────────────

const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type for drafting (only PDF/DOCX allowed)'));
    }
  }
});

router.post(
  '/drafting/edit',
  requireAuth,
  aiRateLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { handleDraftingEdit } = await import('./chat.controller');
    return handleDraftingEdit(req, res);
  })
);
router.post(
  '/drafting',
  express.json(),
  requireAuth,
  aiRateLimiter,
  validate(draftingChatSchema),
  asyncHandler(handleDraftingChat)
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/chat/history
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/history',
  requireAuth,
  aiRateLimiter,
  asyncHandler(getChatHistory)
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/chat/conversations
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/conversations',
  requireAuth,
  asyncHandler(getConversations)
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/chat/conversations/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/conversations/:id',
  requireAuth,
  asyncHandler(getConversation)
);

export default router;