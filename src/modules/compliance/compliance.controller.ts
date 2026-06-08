import { Request, Response } from 'express';
import { ComplianceService } from './compliance.service';
import { ComplianceRepository } from './compliance.repository';
import { GenerateComplianceInput, UpdateItemInput } from './compliance.schema';

export const generateComplianceReport = async (
  req: Request<unknown, unknown, GenerateComplianceInput>,
  res: Response
) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const agentOutput = await ComplianceService.generateComplianceReport(userId, req.body);

    res.status(201).json({ status: 'success', data: agentOutput });
  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};

export const listComplianceReports = async (req: Request, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const reports = await ComplianceRepository.listReports(userId);
    res.status(200).json({ status: 'success', data: reports });
  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};

export const getComplianceReport = async (req: Request<{ reportId: string }>, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const report = await ComplianceRepository.getReportById(req.params.reportId, userId);
    
    if (!report) {
      return res.status(404).json({ status: 'error', message: 'Compliance report not found' });
    }

    res.status(200).json({ status: 'success', data: report });
  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};

export const updateComplianceItemStatus = async (
  req: Request<{ reportId: string; itemId: string }, unknown, UpdateItemInput>,
  res: Response
) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { reportId, itemId } = req.params;
    const { isCompleted, notes } = req.body;

    // Verify ownership
    const report = await ComplianceRepository.getReportById(reportId, userId);
    if (!report) {
      return res.status(404).json({ status: 'error', message: 'Report not found or unauthorized' });
    }

    try {
      const updatedItem = await ComplianceRepository.updateItemStatus(reportId, itemId, isCompleted, notes);
      res.status(200).json({ status: 'success', data: updatedItem });
    } catch (err) {
      // Catch our custom error from the repository
      res.status(404).json({ status: 'error', message: (err as Error).message });
    }

  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};

export const deleteComplianceReport = async (req: Request<{ reportId: string }>, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const deleted = await ComplianceRepository.deleteReport(req.params.reportId, userId);
    
    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Report not found or unauthorized' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};

export const exportReportToPdf = async (req: Request<{ reportId: string }>, res: Response) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const reportId = req.params.reportId;
    
    // Verify ownership
    const report = await ComplianceRepository.getReportById(reportId, userId);
    if (!report) {
      return res.status(404).json({ status: 'error', message: 'Report not found or unauthorized' });
    }

    await ComplianceService.exportToPdf(reportId, userId);

    res.status(202).json({
      status: 'success',
      message: 'PDF generation started. It will be available shortly.'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: (error as Error).message });
  }
};