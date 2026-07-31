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
    sharedToken: draft.sharedToken,
  });
};

export const getSuggestions = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const suggestions = await draftsService.getDraftSuggestions(req.auth!.userId, id);
  res.status(200).json({ success: true, data: { suggestions } });
};

export const reviseDraft = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { instruction } = req.body;
  if (!instruction) {
    return res.status(400).json({ success: false, message: 'Instruction is required' });
  }

  const result = await draftsService.reviseDraft(req.auth!.userId, id, instruction);

  if (result.status === 'NEEDS_CLARIFICATION') {
    return res.status(200).json({
      success: true,
      data: {
        status: 'NEEDS_CLARIFICATION',
        clarificationQuestion: result.clarificationQuestion,
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      status: 'REVISED',
      draft: result.draft,
      summaryOfChanges: result.summaryOfChanges,
    },
  });
};

export const askDraft = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ success: false, message: 'Question is required' });
  }

  const answer = await draftsService.askDraft(req.auth!.userId, id, question);
  res.status(200).json({ success: true, data: { answer } });
};
