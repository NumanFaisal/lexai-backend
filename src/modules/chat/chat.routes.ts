// src/modules/chat/chat.routes.ts
import { Router, Request, Response } from 'express';
import express from 'express';
import {
  getChatHistory,
  handleResearchChat,
  handleCaseAnalysisChat,
  handleComplianceChat,
  handleDraftingChat,
  getConversations,
  getConversation,
  handleDraftingEdit,
  handleVoiceInput,
  handleGenerateTitle,
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
import { aiRateLimiter, apiRateLimiter } from '@/shared/middleware/rate-limit.middleware';
import { enforceQueryLimit } from '@/shared/middleware/query-limit.middleware';

const router = Router();

// POST /api/v1/chat/research

router.post(
  '/research',
  express.json(),
  requireAuth,
  enforceQueryLimit,
  aiRateLimiter,
  validate(researchChatSchema),
  asyncHandler(handleResearchChat)
);

// POST /api/v1/chat/case-analysis

router.post(
  '/case-analysis',
  express.json(),
  requireAuth,
  enforceQueryLimit,
  aiRateLimiter,
  validate(caseAnalysisChatSchema),
  asyncHandler(handleCaseAnalysisChat)
);

// POST /api/v1/chat/compliance

router.post(
  '/compliance',
  express.json(),
  requireAuth,
  enforceQueryLimit,
  aiRateLimiter,
  validate(complianceChatSchema),
  asyncHandler(handleComplianceChat)
);

// DRAFTING


const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (_req, file, cb) => {
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
  enforceQueryLimit,
  aiRateLimiter,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    return handleDraftingEdit(req, res);
  })
);
router.post(
  '/drafting',
  express.json(),
  requireAuth,
  enforceQueryLimit,
  aiRateLimiter,
  validate(draftingChatSchema),
  asyncHandler(handleDraftingChat)
);

// GET /api/v1/chat/history
router.get(
  '/history',
  requireAuth,
  apiRateLimiter,
  asyncHandler(getChatHistory)
);

// GET /api/v1/chat/conversations
router.get(
  '/conversations',
  requireAuth,
  apiRateLimiter,
  asyncHandler(getConversations)
);

// GET /api/v1/chat/conversations/:id
router.get(
  '/conversations/:id',
  requireAuth,
  apiRateLimiter,
  asyncHandler(getConversation)
);


// VOICE INPUT

const uploadAudio = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25Mb
  fileFilter: (_req, file, cb) => {
    // Browsers generate webm, ogg, or mp4 for audio via MediaRecorder API
    const allowedMimeTypes = [
      'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mp3', 
      'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'video/webm' // Safari sometimes sends video/webm for audio
    ];
    if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  }
});

router.post(
  '/voice-input',
  requireAuth,
  enforceQueryLimit,
  aiRateLimiter,
  uploadAudio.single('audio'),
  asyncHandler(handleVoiceInput)
);

// POST /api/v1/chat/generate-title (Groq powered title generator)
router.post(
  '/generate-title',
  express.json(),
  requireAuth,
  apiRateLimiter,
  asyncHandler(handleGenerateTitle)
);

export default router;