import { Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { prisma } from '../../config/db';
import { LegalDocumentRenderer } from './legalPdfRenderer';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import { logger } from '../../config/logger';
import fs from 'fs/promises';
import path from 'path';

export const compliancePdfWorker = new Worker(
  'compliance-pdf-queue',
  async (job: Job) => {
    const { reportId, userId } = job.data;
    logger.info(`Starting PDF generation for compliance report: ${reportId}`);

    const tempFilePath = path.join(__dirname, `temp_compliance_${reportId}.pdf`);

    try {
      // 1. Fetch full report with items from DB
      const report = await prisma.complianceReport.findUnique({
        where: { id: reportId },
        include: { items: true }
      });

      if (!report) throw new Error('Report not found');

      // 2. Format compliance report as structured text
      const contentLines: string[] = [
        'COMPLIANCE OBLIGATION REPORT',
        `Title: ${report.title}`,
        '',
        'BUSINESS PROFILE',
        `- Business Type: ${report.businessType}`,
        `- Operating State: ${report.state}`,
        `- Employee Count: ${report.headcount}`,
        `- Revenue Bracket: ${report.revenueBracket}`,
        `- Handles User Data: ${report.hasUserData ? 'Yes' : 'No'}`,
        `- Food Business: ${report.isFood ? 'Yes' : 'No'}`,
        `- Fintech/Finance: ${report.isFintech ? 'Yes' : 'No'}`,
        '',
        'SUMMARY',
        `- Total Obligations: ${report.totalItems}`,
        `- Urgent Actions: ${report.urgentCount}`,
        `- Completed: ${report.completedCount}`,
        '',
        '=======================================================',
        'COMPLIANCE CHECKLIST ITEMS',
        ''
      ];

      report.items.forEach((item, index) => {
        contentLines.push(
          `${index + 1}. [${item.priority}] ${item.title}`,
          `Law/Act: ${item.law}${item.section ? `, Section ${item.section}` : ''}`,
          `Obligation/Requirement: ${item.requirement}`,
          `Deadline: ${item.deadline || 'N/A'}`,
          `Penalty: ${item.penalty || 'N/A'}`,
          `Action Item: ${item.action || 'N/A'}`,
          `Status: ${item.isCompleted ? 'COMPLETED' : 'PENDING'}`,
          ''
        );
      });

      const formattedContent = contentLines.join('\n');

      // 3. Generate HTML to PDF using LegalDocumentRenderer
      const renderer = new LegalDocumentRenderer('OTHER', tempFilePath);
      await renderer.render(formattedContent);

      const pdfBuffer = await fs.readFile(tempFilePath);

      // 4. Upload to Cloudflare R2 / S3
      const fileKey = `compliance/${userId}/${reportId}-${Date.now()}.pdf`;
      const fileUrl = await r2Storage.uploadFile(fileKey, pdfBuffer, 'application/pdf');

      // 5. Update DB with PDF URL
      await prisma.complianceReport.update({
        where: { id: reportId },
        data: { pdfUrl: fileUrl }
      });

      return { fileUrl };

    } catch (error) {
      logger.error({ msg: `PDF Generation failed for report ${reportId}`, error: (error as Error).message });
      throw error;
    } finally {
      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {});
    }
  },
  { connection: redisClient }
);

compliancePdfWorker.on('error', (err) => {
  logger.error('compliancePdfWorker Error: ' + err.message);
});