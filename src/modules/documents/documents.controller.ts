// src/modules/documents/documents.controller.ts

import { Request, Response } from 'express';
import * as docService from './documents.service';

// Helper to handle potential array parsing in params
const getId = (idParam: string | string[]) => Array.isArray(idParam) ? idParam[0] : idParam;

// ─────────────────────────────────────────────────────────────────────────────
// 1. CORE CRUD OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const createDocument = async (req: Request, res: Response) => {
  const doc = await docService.createAiDocument(req.auth!.userId, req.body);
  res.status(201).json({ success: true, data: doc });
};

export const listDocuments = async (req: Request, res: Response) => {
  const docs = await docService.getUserDocumentsList(req.auth!.userId, req.query);
  res.status(200).json({ success: true, count: docs.length, data: docs });
};

export const getDocument = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const doc = await docService.getDocumentDetails(req.auth!.userId, documentId);
  res.status(200).json({ success: true, data: doc });
};

export const updateDocument = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const doc = await docService.updateDocument(req.auth!.userId, documentId, req.body);
  res.status(200).json({ success: true, data: doc });
};

export const deleteDocument = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  await docService.deleteUserDocument(req.auth!.userId, documentId);
  res.status(200).json({ success: true, message: 'Document archived successfully' });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXPORT & DOWNLOAD OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getDownloadLink = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const url = await docService.getSecureDownloadLink(req.auth!.userId, documentId);
  res.status(200).json({ success: true, downloadUrl: url });
};

export const exportPdf = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const url = await docService.exportDocumentAsPdf(req.auth!.userId, documentId);
  res.status(200).json({ success: true, downloadUrl: url });
};

export const exportDocx = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const url = await docService.exportDocumentAsDocx(req.auth!.userId, documentId);
  res.status(200).json({ success: true, downloadUrl: url });
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. SHARING OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const enableShare = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const doc = await docService.enableShareLink(req.auth!.userId, documentId);
  
  res.status(200).json({ 
    success: true, 
    shareUrl: `${req.protocol}://${req.get('host')}/shared/${doc.sharedToken}`,
    sharedToken: doc.sharedToken 
  });
};

export const disableShare = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  await docService.disableShareLink(req.auth!.userId, documentId);
  res.status(200).json({ success: true, message: 'Sharing disabled' });
};

export const viewSharedDocument = async (req: Request, res: Response) => {
  // Note: This endpoint does not require auth
  const token = getId(req.params.token);
  const doc = await docService.getPublicSharedDocument(token);
  res.status(200).json({ success: true, data: doc });
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. VERSIONING OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getVersions = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const versions = await docService.getDocumentVersions(req.auth!.userId, documentId);
  res.status(200).json({ success: true, data: versions });
};

export const restoreVersion = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const versionNum = parseInt(req.body.version, 10);
  
  if (!versionNum) {
    return res.status(400).json({ success: false, message: 'Version number required' });
  }

  const doc = await docService.restoreDocumentVersion(req.auth!.userId, documentId, versionNum);
  res.status(200).json({ success: true, data: doc });
};

export const reviewDocument = async (req: Request, res: Response) => {
  const documentId = getId(req.params.id);
  const { content, instructions } = req.body;
  
  const updatedDoc = await docService.aiReviewAndEditDocument(
    req.auth!.userId, 
    documentId, 
    content, 
    instructions
  );
  
  res.status(200).json({ 
    success: true, 
    message: 'AI Review complete. New version saved.',
    data: updatedDoc 
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. SAVE FROM CHAT
// ─────────────────────────────────────────────────────────────────────────────

export const saveFromChat = async (req: Request, res: Response) => {
  const userId = req.auth!.userId; 
  const { title, content, type } = req.body;

  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Title and content are required.' });
  }

  const savedDocument = await docService.saveChatAsDocument(userId, title, content, type);

  res.status(201).json({
    success: true,
    message: 'Document saved to storage successfully.',
    data: {
      documentId: savedDocument.id,
      pdfUrl: savedDocument.pdfUrl
    }
  });
};