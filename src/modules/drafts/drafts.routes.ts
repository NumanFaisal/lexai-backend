import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import * as controller from './drafts.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(controller.listDrafts));
router.post('/', asyncHandler(controller.createDraft));
router.put('/:id', asyncHandler(controller.updateDraft));
router.delete('/:id', asyncHandler(controller.deleteDraft));
router.get('/:id/export/pdf', asyncHandler(controller.exportPdf));
router.get('/:id/export/docx', asyncHandler(controller.exportDocx));
router.post('/:id/share', asyncHandler(controller.enableShare));
router.get('/:id/suggestions', asyncHandler(controller.getSuggestions));
router.post('/:id/revise', asyncHandler(controller.reviseDraft));
router.post('/:id/ask', asyncHandler(controller.askDraft));

export default router;
