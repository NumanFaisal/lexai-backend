// src/modules/documents/documents.schema.ts
import { z } from "zod";
import { DocumentType, DocumentStatus } from '@prisma/client';

export const createDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters long"),
    type: z.nativeEnum(DocumentType),
    content: z.string().min(10, "Document content is too short"),
    queryId: z.string().optional(),
    parties: z.any().optional(),           
    jurisdiction: z.string().optional(),  
    governingLaw: z.string().optional(),  
  }),
});

export const updateDocumentSchema = z.object({
  body: z.object({
    title: z.string().min(3).optional(),
    content: z.string().optional(),
    status: z.nativeEnum(DocumentStatus).optional(),
    changeNote: z.string().optional(),
  }),
});


export const reviewDocumentSchema = z.object({
  body: z.object({
    content: z.string().min(10, "Document content is required for review"),
    instructions: z.string().optional(),
  }),
});