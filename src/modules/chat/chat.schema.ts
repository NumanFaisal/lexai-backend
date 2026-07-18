import { z } from 'zod';

const MODEL_ENUM = z.enum(['claude-3-5-sonnet', 'gpt-4o', 'gemini-2.0-flash', 'gemini-1.5-pro']).optional().default('gemini-2.0-flash');

// ─── Research ────────────────────────────────────────────────────────────────

export const researchChatSchema = z.object({
  body: z.object({
    message: z.string().min(2, 'Message must be at least 2 characters.').max(5000),
    model:   MODEL_ENUM,
  }),
});

// ─── Case Analysis ────────────────────────────────────────────────────────────

export const caseAnalysisChatSchema = z.object({
  body: z.object({
    message: z.string().min(10, 'Please describe the case in more detail.').max(10_000),
    model:   MODEL_ENUM,
  }),
});

// ─── Compliance ───────────────────────────────────────────────────────────────

export const complianceChatSchema = z.object({
  body: z.object({
    businessType:   z.string().max(200).optional().or(z.literal('')),
    state:          z.string().max(100).optional().or(z.literal('')),
    headcount:      z.number().int().min(0).max(100_000).optional().default(0),
    revenueBracket: z.string().max(100).optional().default('Not specified'),
    hasUserData:    z.boolean().optional().default(false),
    isFood:         z.boolean().optional().default(false),
    isFintech:      z.boolean().optional().default(false),
    model:          MODEL_ENUM,
  }),
});

// ─── Drafting ─────────────────────────────────────────────────────────────────

const partySchema = z.object({
  name:    z.string().min(1, 'Party name is required.'),
  role:    z.string().min(1, 'Party role is required.'),
  type:    z.string().optional(),
  address: z.string().optional(),
});

export const draftingChatSchema = z.object({
  body: z.object({
    documentType:  z.string().min(2, 'Document type is required.').max(200),
    parties:       z.array(partySchema).min(1, 'At least one party is required.').max(10),
    jurisdiction:  z.string().min(2, 'Jurisdiction is required.').max(200),
    context:       z.string().max(5000).optional(),
    governingLaw:  z.string().max(200).optional(),
    saveDocument:  z.boolean().optional().default(true),
    model:         MODEL_ENUM,
  }),
});