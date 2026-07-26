import prisma from '../../config/db';
import { NotFoundError, AppError } from '../../shared/errors/AppError';
import { DraftStatus, DocumentType } from '@prisma/client';
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

