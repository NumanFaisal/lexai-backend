// src/modules/documents/documents.types.ts
import { DocumentType, DocumentStatus } from "@prisma/client";

export interface CreateDocumentDTO {
  title: string;
  type: DocumentType;
  content: string;
  queryId: string;
  parties?: any;          
  jurisdiction?: string;  
  governingLaw?: string;
}

export interface UpdateDocumentDTO {
  title?: string;
  content?: string;
  status?: DocumentStatus;
  changeNote?: string;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  type?: DocumentType;
  isArchived?: boolean;
  queryId?: string;
}