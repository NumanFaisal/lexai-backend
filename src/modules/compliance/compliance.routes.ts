import { Router } from 'express';
import { 
  listComplianceReports, 
  getComplianceReport, 
  updateComplianceItemStatus, 
  deleteComplianceReport, 
  exportReportToPdf 
} from './compliance.controller';
import { validate } from '../../shared/middleware/validate.middleware';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { updateItemSchema } from './compliance.schema';

const router = Router();

router.use(requireAuth);

// 2. GET (List Compliance Reports) => /api/v1/compliance
router.get('/', listComplianceReports);

// 3. GET (Get Compliance Report) => /api/v1/compliance/:reportId
router.get('/:reportId', getComplianceReport);

// 4. PATCH (Mark Compliance Item Done) => /api/v1/compliance/:reportId/items/:itemId
router.patch(
  '/:reportId/items/:itemId', 
  validate(updateItemSchema), 
  updateComplianceItemStatus
);

// 5. DELETE (Delete Compliance Report) => /api/v1/compliance/:reportId
router.delete('/:reportId', deleteComplianceReport);

// 6. POST (Export Compliance Report as PDF) => /api/v1/compliance/:reportId/export/pdf
router.post('/:reportId/export/pdf', exportReportToPdf);

export default router;