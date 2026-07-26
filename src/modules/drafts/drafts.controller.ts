import { Request, Response } from 'express';
import * as draftsService from './drafts.service';

export const listDrafts = async (req: Request, res: Response) => {
  const drafts = await draftsService.getUserDrafts(req.auth!.userId);
  res.status(200).json({ success: true, data: { drafts } });
};

export const createDraft = async (req: Request, res: Response) => {
  const { templateId, title, content } = req.body;
  const draft = await draftsService.createDraft(req.auth!.userId, templateId, title, content);
  res.status(201).json({ success: true, data: { draft } });
};

export const updateDraft = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { title, content, status } = req.body;
  const draft = await draftsService.updateDraft(req.auth!.userId, id, { title, content, status });
  res.status(200).json({ success: true, data: { draft } });
};

export const deleteDraft = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await draftsService.deleteDraft(req.auth!.userId, id);
  res.status(200).json({ success: true, message: 'Draft deleted' });
};

export const exportPdf = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const url = await draftsService.exportDraftAsPdf(req.auth!.userId, id);
  res.status(200).json({ success: true, downloadUrl: url });
};

export const exportDocx = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const url = await draftsService.exportDraftAsDocx(req.auth!.userId, id);
  res.status(200).json({ success: true, downloadUrl: url });
};

export const enableShare = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const draft = await draftsService.enableShareLinkDraft(req.auth!.userId, id);
  
  res.status(200).json({ 
    success: true, 
    shareUrl: `${req.protocol}://${req.get('host')}/shared/${draft.sharedToken}`,
    sharedToken: draft.sharedToken 
  });
};
