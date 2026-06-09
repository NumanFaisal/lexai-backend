import { Router } from 'express';
import multer from 'multer';
import { validate } from '../../shared/middleware/validate.middleware';
import { analyzeCaseSchema } from './case-analysis.schema';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { aiRateLimiter } from '../../shared/middleware/rate-limit.middleware';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { uploadCase, analyzeCase } from './case-analysis.controller';

const router = Router();

// 15MB limit for PDFs
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

// POST /api/v1/case-analysis/upload
router.post('/upload', requireAuth, upload.single('file'), asyncHandler(uploadCase));

// POST /api/v1/case-analysis/analyze
router.post(
  '/analyze',
  requireAuth,
  aiRateLimiter,
  validate(analyzeCaseSchema),
  asyncHandler(analyzeCase)
);

export default router;
