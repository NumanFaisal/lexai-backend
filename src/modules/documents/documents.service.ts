// src/modules/documents/documents.service.ts

import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import prisma from '../../config/db';
import { DocumentType } from '@prisma/client';
import { documentRepo } from './documents.repository';
import { CreateDocumentDTO, DocumentFilters, UpdateDocumentDTO } from './documents.types';
import { AppError } from '../../shared/errors/AppError';
import { r2Storage } from '../../infrastructure/storage/r2.storage';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CORE AI DOCUMENT LOGIC
// ─────────────────────────────────────────────────────────────────────────────

export const createAiDocument = async (userId: string, data: CreateDocumentDTO) => {
  return await documentRepo.create(userId, data);
};

export const getUserDocumentsList = async (userId: string, filters?: DocumentFilters) => {
  return await documentRepo.findAllByUser(userId, filters);
};

export const getDocumentDetails = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);
  return doc;
};

export const updateDocument = async (userId: string, documentId: string, data: UpdateDocumentDTO) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  return await documentRepo.updateWithVersion(documentId, doc.version, data);
};

export const getSecureDownloadLink = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc || !doc.pdfUrl) throw new AppError('PDF not generated for this document', 404);

  // Generate a secure link valid for 5 minutes
  return await r2Storage.getSignedDownloadUrl(doc.pdfUrl, 300);
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. SAVE CHAT AS PDF LOGIC (User clicks "Save" in Chat)
// ─────────────────────────────────────────────────────────────────────────────

export const saveChatAsDocument = async (
  userId: string, 
  title: string, 
  content: string, 
  type: DocumentType = DocumentType.OTHER
) => {
  const document = await prisma.document.create({
    data: {
      userId,
      title,
      type,
      content,
      status: 'FINALIZED',
      version: 1,
      versions: {
        create: {
          version: 1,
          content,
          changeNote: 'Saved from AI Chat',
        }
      }
    }
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).text(title, { align: 'center' }).moveDown();
    doc.fontSize(12).text(content, { align: 'justify' });
    doc.end();
  });

  const r2Key = `users/${userId}/documents/${document.id}_${title.replace(/\s+/g, '_')}.pdf`;
  await r2Storage.uploadFile(r2Key, pdfBuffer, 'application/pdf');

  const updatedDoc = await prisma.document.update({
    where: { id: document.id },
    data: { pdfUrl: r2Key, pdfGeneratedAt: new Date() }
  });

  return updatedDoc;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. SHARING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

export const enableShareLink = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  const sharedToken = crypto.randomBytes(8).toString('hex');
  return await documentRepo.updateShareStatus(documentId, true, sharedToken);
};

export const disableShareLink = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  return await documentRepo.updateShareStatus(documentId, false, null);
};

export const getPublicSharedDocument = async (token: string) => {
  const doc = await documentRepo.findBySharedToken(token);
  if (!doc) throw new AppError('This document is not available or the link has expired.', 404);
  return doc;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. VERSIONING & DELETION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

export const getDocumentVersions = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  return await documentRepo.getVersions(documentId);
};

export const restoreDocumentVersion = async (userId: string, documentId: string, versionToRestore: number) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  const oldVersion = await documentRepo.getVersionContent(documentId, versionToRestore);
  if (!oldVersion) throw new AppError('Version not found', 404);

  return await documentRepo.updateWithVersion(documentId, doc.version, {
    content: oldVersion.content,
    changeNote: `Restored from version ${versionToRestore}`
  });
};

export const deleteUserDocument = async (userId: string, documentId: string) => {
  const doc = await documentRepo.findByIdAndUser(documentId, userId);
  if (!doc) throw new AppError('Document not found', 404);

  await documentRepo.deleteDocument(documentId);
  return { message: 'Document archived successfully' };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXPORT LOGIC (PDF & DOCX)
// ─────────────────────────────────────────────────────────────────────────────

export const exportDocumentAsDocx = async (userId: string, documentId: string) => {
  const docRecord = await documentRepo.findByIdAndUser(documentId, userId);
  if (!docRecord) throw new AppError('Document not found', 404);

  const docxDoc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ children: [new TextRun({ text: docRecord.title, bold: true, size: 32 })] }),
        new Paragraph({ children: [new TextRun({ text: docRecord.content, size: 24 })] }), // size 24 = 12pt font
      ],
    }],
  });

  const docxBuffer = await Packer.toBuffer(docxDoc);
  const r2Key = `users/${userId}/documents/${documentId}_${docRecord.title.replace(/\s+/g, '_')}.docx`;
  
  await r2Storage.uploadFile(r2Key, docxBuffer as Buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  await prisma.document.update({
    where: { id: documentId },
    data: { docxUrl: r2Key, docxGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};

export const exportDocumentAsPdf = async (userId: string, documentId: string) => {
  const docRecord = await documentRepo.findByIdAndUser(documentId, userId);
  if (!docRecord) throw new AppError('Document not found', 404);

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).text(docRecord.title, { align: 'center' }).moveDown();
    doc.fontSize(12).text(docRecord.content, { align: 'justify' });
    doc.end();
  });

  const r2Key = `users/${userId}/documents/${documentId}_${docRecord.title.replace(/\s+/g, '_')}.pdf`;
  await r2Storage.uploadFile(r2Key, pdfBuffer, 'application/pdf');

  await prisma.document.update({
    where: { id: documentId },
    data: { pdfUrl: r2Key, pdfGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};