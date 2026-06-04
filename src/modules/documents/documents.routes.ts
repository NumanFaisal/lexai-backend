import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { createDocumentSchema, reviewDocumentSchema, updateDocumentSchema } from './documents.schema';
import * as controller from './documents.controller';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Public Routes (NO AUTH REQUIRED)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/shared/:token', asyncHandler(controller.viewSharedDocument));

// ─────────────────────────────────────────────────────────────────────────────
// Protected Routes (AUTH REQUIRED)
// ─────────────────────────────────────────────────────────────────────────────
router.use(requireAuth);

// Core CRUD
router.post('/', validate(createDocumentSchema), asyncHandler(controller.createDocument));
router.get('/', asyncHandler(controller.listDocuments));
router.get('/:id', asyncHandler(controller.getDocument));
router.put('/:id', validate(updateDocumentSchema), asyncHandler(controller.updateDocument));
router.delete('/:id', asyncHandler(controller.deleteDocument));

// Exports
router.post('/:id/export/pdf', asyncHandler(controller.exportPdf));
router.post('/:id/export/docx', asyncHandler(controller.exportDocx));

// Sharing
router.post('/:id/share', asyncHandler(controller.enableShare));
router.delete('/:id/share', asyncHandler(controller.disableShare));

// Versioning
router.get('/:id/versions', asyncHandler(controller.getVersions));
router.post('/:id/versions/restore', asyncHandler(controller.restoreVersion));
router.post('/:id/review', validate(reviewDocumentSchema), asyncHandler(controller.reviewDocument));

// Save from AI Chat
router.post('/save-from-chat', asyncHandler(controller.saveFromChat));

export default router;