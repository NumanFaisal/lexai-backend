import prisma from '../../config/db';
import { NotFoundError } from '../../shared/errors/AppError';
import { DraftStatus } from '@prisma/client';
import crypto from 'crypto';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
import fs from 'fs/promises';
import path from 'path';
// @ts-ignore
import HTMLToDocx from 'html-to-docx';
// @ts-ignore
import htmlToPdfmake from 'html-to-pdfmake';
// @ts-ignore
import jsdom from 'jsdom';
import pdfmake from 'pdfmake';
import { reviewAgent } from '../../ai/agents/drafting/review.agent';
import { analysisAgent } from '../../ai/agents/drafting/analysis.agent';

export const getUserDrafts = async (userId: string) => {
  return await prisma.draft.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
};

export const createDraft = async (userId: string, templateId: string | undefined, title: string, content: string) => {
  return await prisma.draft.create({
    data: {
      userId,
      templateId,
      title,
      content,
      status: DraftStatus.IN_PROGRESS,
    },
  });
};

export const updateDraft = async (userId: string, draftId: string, data: { title?: string; content?: string; status?: DraftStatus }) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw new NotFoundError('Draft not found');
  }

  return await prisma.draft.update({
    where: { id: draftId },
    data,
  });
};

export const deleteDraft = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw new NotFoundError('Draft not found');
  }

  return await prisma.draft.delete({
    where: { id: draftId },
  });
};

export const exportDraftAsDocx = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Convert the TipTap HTML to a DOCX buffer retaining full formatting (bold, underline, bullets)
  const docxBuffer = await HTMLToDocx(draft.content, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    font: 'Times New Roman',
  });

  const r2Key = `users/${userId}/drafts/${draftId}_${draft.title.replace(/\s+/g, '_')}.docx`;
  
  await r2Storage.uploadFile(r2Key, docxBuffer as Buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  await prisma.draft.update({
    where: { id: draftId },
    data: { docxUrl: r2Key, docxGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};

export const exportDraftAsPdf = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Parse HTML into PDFMake definition
  const { JSDOM } = jsdom;
  const { window } = new JSDOM("");
  
  const content = htmlToPdfmake(draft.content, { window });

  const fonts = {
    Times: {
        normal: 'Times-Roman',
        bold: 'Times-Bold',
        italics: 'Times-Italic',
        bolditalics: 'Times-BoldItalic'
    }
  };
  pdfmake.setFonts(fonts);

  const docDefinition = {
    content,
    pageSize: 'A4',
    pageMargins: [28.346 * 3.5, 28.346 * 2.5, 28.346 * 2.5, 28.346 * 2.5] as [number, number, number, number], // standard legal margins
    defaultStyle: { font: 'Times', fontSize: 11, alignment: 'justify' as const, lineHeight: 1.5 },
  };

  const doc = pdfmake.createPdf(docDefinition);
  
  const tempFilePath = path.join(__dirname, `temp_${draftId}.pdf`);
  await doc.write(tempFilePath);

  const pdfBuffer = await fs.readFile(tempFilePath);
  await fs.unlink(tempFilePath).catch(() => {});

  const r2Key = `users/${userId}/drafts/${draftId}_${draft.title.replace(/\s+/g, '_')}.pdf`;
  await r2Storage.uploadFile(r2Key, pdfBuffer, 'application/pdf');

  await prisma.draft.update({
    where: { id: draftId },
    data: { pdfUrl: r2Key, pdfGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};

export const enableShareLinkDraft = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const sharedToken = crypto.randomBytes(8).toString('hex');
  return await prisma.draft.update({
    where: { id: draftId },
    data: {
      isShared: true,
      sharedToken,
      sharedAt: new Date(),
    }
  });
};

export const getDraftSuggestions = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Infer document type for checklists
  let docType = 'NDA';
  const title = draft.title.toLowerCase();
  if (title.includes('employment')) docType = 'EMPLOYMENT_AGREEMENT';
  else if (title.includes('rent') || title.includes('lease')) docType = 'RENT_AGREEMENT';
  else if (title.includes('vakalatnama')) docType = 'VAKALATNAMA';
  else if (title.includes('sale deed')) docType = 'SALE_DEED';
  else if (title.includes('power of attorney') || title.includes('gpa')) docType = 'POWER_OF_ATTORNEY';
  else if (title.includes('anticipatory bail')) docType = 'BAIL_APPLICATION';
  else if (title.includes('bail')) docType = 'BAIL_APPLICATION';
  
  const documentFields = analysisAgent.extractFieldsFromHTML(draft.content);
  const missingClauses = await analysisAgent.detectMissingClauses(draft.content, docType);
  const jurisWarnings = analysisAgent.checkJurisdictionConsistency(documentFields);

  const unifiedSuggestions = [
    ...missingClauses.map(m => ({
      id: Math.random().toString(36).substr(2, 9),
      type: m.severity === 'high' ? 'warning' : 'improvement',
      text: `Missing Clause: ${m.clauseType.replace(/_/g, ' ')}. ${m.suggestedAction}`,
      actionPrompt: m.suggestedAction
    })),
    ...jurisWarnings.map(j => ({
      id: Math.random().toString(36).substr(2, 9),
      type: 'warning',
      text: j.message,
      actionPrompt: 'Review Jurisdiction'
    }))
  ];

  // If no specific missing clauses, we can add a generic improvement
  if (unifiedSuggestions.length === 0) {
    unifiedSuggestions.push({
      id: Math.random().toString(36).substr(2, 9),
      type: 'improvement',
      text: 'Consider adding a severability and waiver clause for stronger enforceability.',
      actionPrompt: 'Add severability and waiver clauses'
    });
  }

  return unifiedSuggestions;
};

export const reviseDraft = async (userId: string, draftId: string, instruction: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const revisedHTML = await reviewAgent.reviseHTMLDocument(userId, draft.content, draft.title || 'Legal Document', instruction);
  
  const updatedDraft = await prisma.draft.update({
    where: { id: draftId },
    data: { content: revisedHTML },
  });

  return updatedDraft;
};

export const askDraft = async (userId: string, draftId: string, question: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const answer = await reviewAgent.answerQuestion(draft.content, draft.title || 'Legal Document', question);
  return answer;
};
