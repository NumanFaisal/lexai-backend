// src/modules/voice/voice.routes.ts
import { Router } from 'express';
import { getTranscriptions } from './voice.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { apiRateLimiter } from '../../shared/middleware/rate-limit.middleware';

const router = Router();

// GET /api/v1/voice/transcriptions
router.get(
  '/transcriptions',
  requireAuth,
  apiRateLimiter,
  asyncHandler(getTranscriptions)
);

export default router;