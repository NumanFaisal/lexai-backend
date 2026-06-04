import { Router } from 'express';
import multer from 'multer';
import { validate } from '../../shared/middleware/validate.middleware';
import { askCaseSchema } from './cases.schema';
import { requireAuth } from '@/shared/middleware/auth.middleware';
import { askCase, uploadCase } from './cases.controller';

const router = Router();

// 15MB limit
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

router.post('/upload', requireAuth, upload.single('file'), uploadCase);
router.post('/:caseId/ask', requireAuth, validate(askCaseSchema), askCase);

export default router;
