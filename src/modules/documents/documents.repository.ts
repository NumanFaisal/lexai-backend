// src/modules/documents/documents.repository.ts
import prisma from "../../config/db";
import { CreateDocumentDTO, DocumentFilters, UpdateDocumentDTO } from './documents.types';

export const documentRepo = {
  async create(userId: string, data: CreateDocumentDTO) {
    return await prisma.document.create({
      data: {
        userId,
        title: data.title,
        type: data.type,
        content: data.content,
        queryId: data.queryId,
        parties: data.parties,           
        jurisdiction: data.jurisdiction,  
        governingLaw: data.governingLaw, 
        versions: {
          create: {
            version: 1,
            content: data.content,
            changeNote: 'Initial AI Draft', // Fixed spelling here
          },
        },
      },
    });
  },
  
  async findAllByUser(userId: string, filters: DocumentFilters = {}) {
    return await prisma.document.findMany({
      where: {
        userId,
        isArchived: filters.isArchived ?? false,
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        pdfUrl: true,
        createdAt: true,
        updatedAt: true,
      }
    });
  },

  async findByIdAndUser(id: string, userId: string) {
    return await prisma.document.findFirst({
      where: { id, userId },
      include: { versions: { orderBy: { version: 'desc' } } }
    });
  },

  async updateWithVersion(id: string, currentVersions: number, data: UpdateDocumentDTO) {
    const newVersionNum = currentVersions + 1;

    return await prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        status: data.status,
        version: newVersionNum,
        versions: data.content ? {
          create: {
            version: newVersionNum,
            content: data.content,
            changeNote: data.changeNote || 'Manual edit',
          }
        } : undefined,
      }
    });
  },

  async delete(id: string) {
    // Soft delete by archiving
    return await prisma.document.update({
      where: { id },
      data: { isArchived: true }
    });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW LOGIC: SHARING & VERSIONING
  // ─────────────────────────────────────────────────────────────────────────────

  async updateShareStatus(id: string, isShared: boolean, sharedToken: string | null) {
    return await prisma.document.update({
      where: { id },
      data: {
        isShared,
        sharedToken,
        sharedAt: isShared ? new Date() : null,
      },
    });
  },

  async findBySharedToken(sharedToken: string) {
    // Finds a document publicly using the secret token (No userId check here!)
    return await prisma.document.findFirst({
      where: { sharedToken, isShared: true, isArchived: false },
      select: {
        title: true,
        type: true,
        content: true,
        updatedAt: true,
        user: { select: { name: true } }, // Show who authored it
      },
    });
  },

  async getVersions(documentId: string) {
    return await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, savedAt: true, changeNote: true },
    });
  },

  async getVersionContent(documentId: string, version: number) {
    return await prisma.documentVersion.findFirst({
      where: { documentId, version },
    });
  },

  async deleteDocument(id: string) {
    // Exact same as delete(), just named for clarity with the service call
    return await prisma.document.update({
      where: { id },
      data: { isArchived: true },
    });
  }
};