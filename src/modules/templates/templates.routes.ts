import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async.wrapper';
import * as controller from './templates.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/', asyncHandler(controller.listTemplates));
router.get('/:id', asyncHandler(controller.getTemplate));

export default router;
