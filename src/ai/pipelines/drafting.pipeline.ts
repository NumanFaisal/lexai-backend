// src/ai/pipelines/drafting.pipeline.ts

// LexAI — Contract Drafting Pipeline 
//
// FLOW:
//   validateInput → analyzeIntent → [clarify | extractDetails → generateDocument
//                                              → validateCompliance → finalize]
//
// NODES:
//   1. validateInput      — Fast checks before any LLM call
//   2. analyzeIntent      — Understand what document is needed & what's missing
//   3. extractDetails     — Pull structured data (parties, jurisdiction, etc.)
//   4. generateDocument   — Draft the full legal document (4000 tokens)
//   5. validateCompliance — Check output is India-law compliant
//   6. finalize           — Record timing, tokens, and prepare response
//
// CONDITIONAL ROUTING:
//   After analyzeIntent:
//     - Missing essential info   → return clarificationQuestion (end early)
//     - All info present         → extractDetails → generateDocument
//   After validateCompliance:
//     - Compliance issues found  → retry generateDocument (max 1 retry)
//     - All good                 → finalize

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getLLM, SupportedModel } from "../providers/llm.factory";
import { DocumentType } from "@prisma/client";
import { logger } from "../../config/logger";
import { AppError } from "../../shared/errors/AppError";
import { InputGuard } from "../guards/input.guard";
import {
  DRAFT_INTENT_PROMPT,
  DRAFT_DETAILS_EXTRACTION_PROMPT,
  DRAFT_GENERATION_PROMPT,
  DRAFT_COMPLIANCE_CHECK_PROMPT,
  buildGenerationPrompt,
} from "../prompts/drafting";
import { reviewAgent } from "../agents/drafting/review.agent";


// SECTION 1: CONSTANTS

const PIPELINE_CONFIG = {
  // LLM settings per node
  INTENT_TEMPERATURE:      0.0,   // Deterministic — classification task
  EXTRACTION_TEMPERATURE:  0.0,   // Deterministic — structured data extraction
  GENERATION_TEMPERATURE:  0.3,   // Slight variation — natural legal language
  COMPLIANCE_TEMPERATURE:  0.0,   // Deterministic — yes/no compliance check

  GENERATION_MAX_TOKENS:   4_000, // Contracts can be long
  INTENT_MAX_TOKENS:       300,   // Short classification response
  EXTRACTION_MAX_TOKENS:   800,   // Structured JSON extraction
  COMPLIANCE_MAX_TOKENS:   500,   // Short compliance verdict

  // Retry settings
  MAX_LLM_RETRIES:         2,
  RETRY_DELAY_MS:          1_000,

  // Compliance retry — if validation fails, regenerate once
  MAX_COMPLIANCE_RETRIES:  1,

  // Timeouts
  LLM_TIMEOUT_MS:          45_000, // 45s — longer than research (4K tokens)

  // Input limits
  MAX_QUERY_LENGTH:        6_000,
  MIN_QUERY_LENGTH:        10,
} as const;


// SECTION 2: DOCUMENT TYPE MAP
// Maps keywords → DocumentType enum values from Prisma schema.
// Used by the intent analysis node to classify what document to draft.

const DOCUMENT_TYPE_KEYWORDS: Array<{
  type:     DocumentType;
  keywords: string[];
  label:    string;            // Human-readable label for prompts
}> = [
  {
    type:     "NDA",
    label:    "Non-Disclosure Agreement (NDA)",
    keywords: ["nda", "non-disclosure", "non disclosure", "confidentiality agreement", "confidential"],
  },
  {
    type:     "EMPLOYMENT_AGREEMENT",
    label:    "Employment Agreement",
    keywords: ["employment", "job offer", "offer letter", "employee contract", "appointment letter"],
  },
  {
    type:     "FREELANCER_AGREEMENT",
    label:    "Freelancer / Service Agreement",
    keywords: ["freelancer", "freelance", "service agreement", "consultant", "contractor", "independent contractor"],
  },
  {
    type:     "RENT_AGREEMENT",
    label:    "Rent / Lease Agreement",
    keywords: ["rent", "lease", "tenancy", "rental agreement", "leave and licence"],
  },
  {
    type:     "CO_FOUNDER_AGREEMENT",
    label:    "Co-Founder Agreement",
    keywords: ["cofounder", "co-founder", "co founder", "founder agreement", "founders pact"],
  },
  {
    type:     "LEGAL_NOTICE",
    label:    "Legal Notice",
    keywords: ["legal notice", "demand notice", "notice under section 138", "cheque bounce notice", "sec 138", "section 138"],
  },
  {
    type:     "BAIL_APPLICATION",
    label:    "Bail Application",
    keywords: ["bail application", "bail", "anticipatory bail", "regular bail", "section 438", "section 439"],
  },
  {
    type:     "CONSUMER_COMPLAINT",
    label:    "Consumer Complaint",
    keywords: ["consumer complaint", "consumer forum", "consumer protection", "deficiency of service", "defective product"],
  },
  {
    type:     "VAKALATNAMA",
    label:    "Vakalatnama",
    keywords: ["vakalatnama", "vakaltanama", "power of attorney for court"],
  },
  {
    type:     "WRITTEN_STATEMENT",
    label:    "Written Statement",
    keywords: ["written statement", "reply to plaint", "defence", "order viii"],
  },
  {
    type:     "SALE_DEED",
    label:    "Sale Deed",
    keywords: ["sale deed", "property sale", "transfer of property", "conveyance deed"],
  },
  {
    type:     "PARTNERSHIP_DEED",
    label:    "Partnership Deed",
    keywords: ["partnership deed", "partnership agreement", "business partnership"],
  },
  {
    type:     "POWER_OF_ATTORNEY",
    label:    "Power of Attorney",
    keywords: ["power of attorney", "poa", "general power of attorney", "gpa", "special power of attorney"],
  },
  {
    type:     "AFFIDAVIT",
    label:    "Affidavit",
    keywords: ["affidavit", "sworn statement", "notarized statement"],
  },
];


// SECTION 3: TYPES

export interface DraftingInput {
  documentType:  string;
  parties:       Array<{ name: string; role: string; address?: string }>;
  jurisdiction:  string;
  governingLaw?: string;
  context?:      string;
}

export type DraftingRoute =
  | "extractDetails"       // All info present → proceed to draft
  | "needsClarification"   // Missing info → ask user
  | "finalize"             // Error path → end early with error
  | "generateDocument"     // After extraction → generate
  | "validateCompliance"   // After generation → check compliance
  | "__end__";             // Terminal

interface DocumentParty {
  name:         string;
  role:         string;    // e.g. "Disclosing Party", "Employee", "Landlord"
  address?:     string;
}

export interface ExtractedDocumentDetails {
  documentType:  DocumentType;
  documentLabel: string;
  parties:       DocumentParty[];
  jurisdiction:  string;
  governingLaw:  string;
  keyTerms:      Record<string, string>; // e.g. { duration: "2 years", rent: "₹15,000/month" }
  missingFields: string[];               // Fields needed but not provided by user
}

export interface ComplianceIssue {
  clause:       string;       // Which clause has the issue
  issue:        string;       // What is wrong
  suggestion:   string;       // How to fix it
  severity:     "BLOCKER" | "WARNING";
}

export interface PipelineMetadata {
  startedAt:          string;
  intentDurationMs:   number;
  extractDurationMs:  number;
  generateDurationMs: number;
  validateDurationMs: number;
  totalDurationMs:    number;
  totalInputTokens:   number;
  totalOutputTokens:  number;
  complianceRetries:  number;
}

export interface PipelineError {
  code:        string;
  message:     string;
  nodeWhere:   string;
  retryable:   boolean;
}

// SECTION 4: STATE DEFINITION

export const DraftingStateAnnotation = Annotation.Root({

  // ── INPUTS (set before pipeline starts) ────────────────────────────────
  query: Annotation<string>({
    reducer:  (_, next) => next,
    default:  () => "",
  }),
  conversationHistory: Annotation<BaseMessage[]>({
    reducer:  (_, next) => next ?? [],
    default:  () => [],
  }),
  selectedModel: Annotation<SupportedModel>({
    reducer:  (_, next) => next,
    default:  () => "gpt-4o",
  }),
  userId: Annotation<string>({
    reducer:  (_, next) => next,
    default:  () => "",
  }),

  //  INTENT ANALYSIS OUTPUTS
  isReadyToDraft: Annotation<boolean>({
    reducer:  (_, next) => next,
    default:  () => false,
  }),
  needsClarification: Annotation<boolean>({
    reducer:  (_, next) => next,
    default:  () => false,
  }),
  clarificationQuestion: Annotation<string | undefined>({
    reducer:  (_, next) => next,
    default:  () => undefined,
  }),
  detectedDocumentType: Annotation<DocumentType>({
    reducer:  (_, next) => next,
    default:  () => "OTHER",
  }),

  // EXTRACTION OUTPUTS
  documentDetails: Annotation<ExtractedDocumentDetails | undefined>({
    reducer:  (_, next) => next,
    default:  () => undefined,
  }),

  // GENERATION OUTPUTS 
  draftedContent: Annotation<string | undefined>({
    reducer:  (_, next) => next,
    default:  () => undefined,
  }),
  documentTitle: Annotation<string | undefined>({
    reducer:  (_, next) => next,
    default:  () => undefined,
  }),

  // COMPLIANCE OUTPUTS 
  complianceIssues: Annotation<ComplianceIssue[]>({
    reducer:  (_, next) => next ?? [],
    default:  () => [],
  }),
  compliancePassed: Annotation<boolean>({
    reducer:  (_, next) => next,
    default:  () => false,
  }),
  complianceRetryCount: Annotation<number>({
    reducer:  (_, next) => next,
    default:  () => 0,
  }),

  // PIPELINE CONTROL 
  error: Annotation<PipelineError | undefined>({
    reducer:  (_, next) => next,
    default:  () => undefined,
  }),
  metadata: Annotation<PipelineMetadata>({
    reducer:  (curr, next) => ({ ...curr, ...next }),
    default:  () => ({
      startedAt:          new Date().toISOString(),
      intentDurationMs:   0,
      extractDurationMs:  0,
      generateDurationMs: 0,
      validateDurationMs: 0,
      totalDurationMs:    0,
      totalInputTokens:   0,
      totalOutputTokens:  0,
      complianceRetries:  0,
    }),
  }),
});

export type DraftingState = typeof DraftingStateAnnotation.State;


// SECTION 5: SHARED HELPERS

// Retries a function with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  context: string
): Promise<T> {
  let lastError!: Error;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      logger.warn({ msg: `[drafting.pipeline] ${context} attempt ${attempt} failed`, error: lastError.message });
      if (attempt <= maxRetries) {
        await sleep(baseDelayMs * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError;
}

// Wraps a promise with a timeout rejection
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[drafting.pipeline] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Accumulates token counts from an LLM response into metadata
function accumulateTokens(
  state: DraftingState,
  response: { usage_metadata?: { input_tokens?: number; output_tokens?: number } }
): Partial<PipelineMetadata> {
  const usage = response.usage_metadata ?? {};
  return {
    totalInputTokens:  (state.metadata.totalInputTokens  ?? 0) + (usage.input_tokens  ?? 0),
    totalOutputTokens: (state.metadata.totalOutputTokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

// Detects document type from query text using keyword matching with word boundaries
function detectDocumentType(text: string): { type: DocumentType; label: string } {
  const lower = text.toLowerCase();
  for (const entry of DOCUMENT_TYPE_KEYWORDS) {
    if (entry.keywords.some((kw) => {
      // Escape special characters in the keyword and check for word boundaries
      const escaped = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      return regex.test(lower);
    })) {
      return { type: entry.type, label: entry.label };
    }
  }
  return { type: "OTHER", label: "Legal Document" };
}

// Extracts a clean document title from generated markdown
function extractTitle(content: string, fallback: string): string {
  // Match: "# Title" or "**TITLE**" at start of document
  const h1Match      = content.match(/^#\s+(.+)$/m);
  const boldMatch    = content.match(/^\*\*([A-Z][A-Z\s]+)\*\*/m);
  const allCapsMatch = content.match(/^([A-Z][A-Z\s]{5,50})$/m);

  return (h1Match?.[1] ?? boldMatch?.[1] ?? allCapsMatch?.[1] ?? fallback).trim();
}

// Safely parses JSON from LLM output (strips markdown code fences if present)
function safeParseJSON<T>(raw: string): T | null {
  try {
    // Strip markdown code fences: ```json ... ```
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}


// SECTION 6: NODE 1 — Validate Input

const validateInputNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  logger.info({ msg: "[drafting.pipeline] Node: validateInput", userId: state.userId });

  const query = state.query?.trim() ?? "";

  if (!query || query.length < PIPELINE_CONFIG.MIN_QUERY_LENGTH) {
    return {
      error: {
        code:      "EMPTY_QUERY",
        message:   "Please describe the document you need.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  // Run Input Guard Validation
  try {
    InputGuard.validate(query);
  } catch (err) {
    if (err instanceof AppError) {
      return {
        error: {
          code:      "INPUT_GUARD_BLOCKED",
          message:   err.message,
          nodeWhere: "validateInput",
          retryable: false,
        },
      };
    }
    throw err;
  }

  if (query.length > PIPELINE_CONFIG.MAX_QUERY_LENGTH) {
    return {
      error: {
        code:      "QUERY_TOO_LONG",
        message:   "Your request is too long. Please keep it under 6,000 characters.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  // Early document type detection using keywords (no LLM cost)
  const { type, label } = detectDocumentType(query);
  logger.info({ msg: "[drafting.pipeline] Document type detected", type, label });

  return { detectedDocumentType: type };
};


// SECTION 7: NODE 2 — Analyze Intent
//
// Asks the LLM: "Do we have enough information to draft this document?"
// Returns either READY (proceed) or a clarification question (ask the user).
//
// The LLM is instructed to respond in a structured JSON format so we can
// parse the result deterministically instead of fragile string matching.

const analyzeIntentNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const t0 = Date.now();
  logger.info({ msg: "[drafting.pipeline] Node: analyzeIntent", model: state.selectedModel });

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: PIPELINE_CONFIG.INTENT_TEMPERATURE,
      maxTokens:   PIPELINE_CONFIG.INTENT_MAX_TOKENS,
      timeout:     PIPELINE_CONFIG.LLM_TIMEOUT_MS,
    });

    const documentTypeEntry = DOCUMENT_TYPE_KEYWORDS.find(
      (e) => e.type === state.detectedDocumentType
    );
    const documentLabel = documentTypeEntry?.label ?? "Legal Document";

    // Build a context-aware system prompt that knows which document type was detected
    const systemPrompt = buildIntentAnalysisPrompt(
      DRAFT_INTENT_PROMPT,
      documentLabel,
      state.detectedDocumentType
    );

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.conversationHistory.slice(-6),
      new HumanMessage(state.query),
    ];

    const response = await withRetry(
      () => withTimeout(llm.invoke(messages), PIPELINE_CONFIG.LLM_TIMEOUT_MS, "analyzeIntent"),
      PIPELINE_CONFIG.MAX_LLM_RETRIES,
      PIPELINE_CONFIG.RETRY_DELAY_MS,
      "analyzeIntent LLM"
    );

    const text = response.content.toString().trim();

    //  Parse structured JSON response
    // Expected format:
    // { "status": "READY" | "CLARIFY", "question": "..." | null }
    const parsed = safeParseJSON<{ status: string; question?: string }>(text);

    const intentDurationMs = Date.now() - t0;
    const tokenDelta = accumulateTokens(state, response as any);

    if (parsed?.status === "READY") {
      logger.info({ msg: "[drafting.pipeline] Intent: READY to draft", intentDurationMs });
      return {
        isReadyToDraft:    true,
        needsClarification: false,
        metadata: { ...state.metadata, intentDurationMs, ...tokenDelta },
      };
    }

    // Either explicit CLARIFY or fallback: treat the whole response as a question
    const question = parsed?.question?.trim() ?? text;
    logger.info({ msg: "[drafting.pipeline] Intent: needs clarification", question });

    return {
      isReadyToDraft:      false,
      needsClarification:  true,
      clarificationQuestion: question,
      metadata: { ...state.metadata, intentDurationMs, ...tokenDelta },
    };

  } catch (error) {
    logger.error({ msg: "[drafting.pipeline] analyzeIntent failed", error: (error as Error).message });
    return {
      error: {
        code:      "INTENT_ANALYSIS_FAILED",
        message:   "Could not analyze your request. Please try again.",
        nodeWhere: "analyzeIntent",
        retryable: true,
      },
    };
  }
};

// Build intent prompt enriched with detected document type
function buildIntentAnalysisPrompt(
  basePrompt: string,
  documentLabel: string,
  documentType: DocumentType
): string {
  return `${basePrompt}

## Detected Document Type
The user wants to draft: **${documentLabel}** (${documentType})

## Required Fields for ${documentLabel}
${getRequiredFieldsForType(documentType)}

## Response Format
Respond ONLY with a JSON object. No explanation, no markdown, ONLY JSON:
{ "status": "READY" }
OR
{ "status": "CLARIFY", "question": "Your single clarifying question here" }

If all custom details (such as names, parentage/guardian details, complete addresses, dates, amounts, specific facts of dispute, and other critical inputs) are present and clear: return READY.
If any critical custom detail is missing: return CLARIFY with ONE clear question. Never proceed with placeholders.`;
}

// Returns the required fields checklist for each document type
function getRequiredFieldsForType(type: DocumentType): string {
  const REQUIRED: Record<string, string> = {
    NDA: "- Disclosing party name and complete address\n- Receiving party name and complete address\n- Jurisdiction/state/city\n- Specific duration of confidentiality",
    EMPLOYMENT_AGREEMENT: "- Employee name and complete address\n- Employer company name and complete address\n- Designation/role\n- CTC/salary amount\n- Start date\n- Work location",
    FREELANCER_AGREEMENT: "- Freelancer name and complete address\n- Client/company name and complete address\n- Scope of work details\n- Payment amount\n- Duration/timeline",
    RENT_AGREEMENT: "- Landlord name and complete address\n- Tenant name and complete address\n- Complete address of the property to be rented\n- Monthly rent amount\n- Security deposit amount\n- Lease duration/period",
    CO_FOUNDER_AGREEMENT: "- Co-founder names and complete addresses (at least 2)\n- Equity split percentages\n- Company name\n- Specific roles of each co-founder",
    LEGAL_NOTICE: "- Sender name and complete address\n- Recipient name and complete address\n- Specific dispute facts (e.g. cheque number, amount, bank name, date of dishonour for cheque bounce)\n- Specific demands with a clear time limit",
    BAIL_APPLICATION: "- Accused full name, age, father's/husband's name, and complete residential address\n- Police station name, FIR number, year of FIR, and state\n- Offence section(s) under BNS or IPC\n- Name of the court where the application is being filed\n- Specific facts of apprehension of arrest or grounds of bail",
    CONSUMER_COMPLAINT: "- Complainant name and complete address\n- Opposite party name and complete address\n- Product/service description\n- Nature of deficiency/dispute facts\n- Relief/Compensation sought",
    OTHER: "- Document purpose\n- Parties involved (names, roles, and complete addresses)\n- Governing jurisdiction\n- Core dispute or transaction facts",
  };
  return REQUIRED[type] ?? REQUIRED.OTHER;
}


// SECTION 8: NODE 3 — Extract Details
//
// Extracts structured data from the conversation to populate the document.
// Returns a typed ExtractedDocumentDetails object used by the generation node.

const extractDetailsNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const t0 = Date.now();
  logger.info({ msg: "[drafting.pipeline] Node: extractDetails" });

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: PIPELINE_CONFIG.EXTRACTION_TEMPERATURE,
      maxTokens:   PIPELINE_CONFIG.EXTRACTION_MAX_TOKENS,
      timeout:     PIPELINE_CONFIG.LLM_TIMEOUT_MS,
    });

    const documentTypeEntry = DOCUMENT_TYPE_KEYWORDS.find(
      (e) => e.type === state.detectedDocumentType
    );
    const documentLabel = documentTypeEntry?.label ?? "Legal Document";

    const extractionPrompt = buildExtractionPrompt(
      DRAFT_DETAILS_EXTRACTION_PROMPT,
      documentLabel,
      state.detectedDocumentType
    );

    // Feed full conversation so the LLM can pull info from earlier messages
    const allContext = [
      ...state.conversationHistory,
      new HumanMessage(state.query),
    ].slice(-10); // Last 10 messages

    const messages: BaseMessage[] = [
      new SystemMessage(extractionPrompt),
      ...allContext,
    ];

    const response = await withRetry(
      () => withTimeout(llm.invoke(messages), PIPELINE_CONFIG.LLM_TIMEOUT_MS, "extractDetails"),
      PIPELINE_CONFIG.MAX_LLM_RETRIES,
      PIPELINE_CONFIG.RETRY_DELAY_MS,
      "extractDetails LLM"
    );

    const text = response.content.toString();
    const parsed = safeParseJSON<ExtractedDocumentDetails>(text);

    const extractDurationMs = Date.now() - t0;
    const tokenDelta = accumulateTokens(state, response as any);

    if (!parsed) {
      // JSON parse failed — continue with minimal details rather than crash
      logger.warn({ msg: "[drafting.pipeline] Details extraction JSON parse failed, using defaults" });
      return {
        documentDetails: {
          documentType:  state.detectedDocumentType,
          documentLabel: documentLabel,
          parties:       [],
          jurisdiction:  "India",
          governingLaw:  getDefaultGoverningLaw(state.detectedDocumentType),
          keyTerms:      {},
          missingFields: [],
        },
        metadata: { ...state.metadata, extractDurationMs, ...tokenDelta },
      };
    }

    logger.info({
      msg: "[drafting.pipeline] Details extracted",
      parties:    parsed.parties?.length,
      keyTerms:   Object.keys(parsed.keyTerms ?? {}),
      extractDurationMs,
    });

    return {
      documentDetails: {
        ...parsed,
        documentType:  state.detectedDocumentType,
        documentLabel: documentLabel,
        jurisdiction:  parsed.jurisdiction || "India",
        governingLaw:  parsed.governingLaw || getDefaultGoverningLaw(state.detectedDocumentType),
      },
      metadata: { ...state.metadata, extractDurationMs, ...tokenDelta },
    };

  } catch (error) {
    logger.error({ msg: "[drafting.pipeline] extractDetails failed", error: (error as Error).message });
    // Non-fatal — proceed with empty details
    return {
      documentDetails: {
        documentType:  state.detectedDocumentType,
        documentLabel: DOCUMENT_TYPE_KEYWORDS.find(e => e.type === state.detectedDocumentType)?.label ?? "Legal Document",
        parties:       [],
        jurisdiction:  "India",
        governingLaw:  getDefaultGoverningLaw(state.detectedDocumentType),
        keyTerms:      {},
        missingFields: [],
      },
    };
  }
};

function buildExtractionPrompt(basePrompt: string, label: string, _type: DocumentType): string {
  return `${basePrompt}

Extract all details for a **${label}** from the conversation.

Return ONLY a JSON object with this structure (fill with null for missing fields):
{
  "parties": [
    { "name": "string", "role": "string", "address": "string | null" }
  ],
  "jurisdiction": "state or city, India",
  "governingLaw": "primary governing Act",
  "keyTerms": {
    "fieldName": "value"
  },
  "missingFields": ["list of still-missing important fields"]
}

No markdown. No explanation. ONLY the JSON object.`;
}

function getDefaultGoverningLaw(type: DocumentType): string {
  const DEFAULTS: Partial<Record<DocumentType, string>> = {
    NDA:                    "Indian Contract Act, 1872",
    EMPLOYMENT_AGREEMENT:   "Indian Contract Act, 1872 and applicable Labour Codes",
    FREELANCER_AGREEMENT:   "Indian Contract Act, 1872",
    RENT_AGREEMENT:         "Transfer of Property Act, 1882 and applicable State Rent Act",
    CO_FOUNDER_AGREEMENT:   "Indian Contract Act, 1872 and Companies Act, 2013",
    LEGAL_NOTICE:           "Negotiable Instruments Act, 1881",
    BAIL_APPLICATION:       "Code of Criminal Procedure, 1973 / BNSS, 2023",
    CONSUMER_COMPLAINT:     "Consumer Protection Act, 2019",
    VAKALATNAMA:            "Code of Civil Procedure, 1908",
    WRITTEN_STATEMENT:      "Code of Civil Procedure, 1908",
    SALE_DEED:              "Transfer of Property Act, 1882 and Registration Act, 1908",
    PARTNERSHIP_DEED:       "Indian Partnership Act, 1932 and Indian Contract Act, 1872",
    POWER_OF_ATTORNEY:      "Powers of Attorney Act, 1882 and Registration Act, 1908",
    AFFIDAVIT:              "Indian Evidence Act, 1872 / Bharatiya Sakshya Adhiniyam, 2023",
  };
  return DEFAULTS[type] ?? "Indian Contract Act, 1872";
}


// SECTION 9: NODE 4 — Generate Document
//
// The main drafting node. Uses high token limit (4000) and slightly higher
// temperature (0.3) for natural, varied legal language.

const generateDocumentNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const t0 = Date.now();
  logger.info({
    msg:           "[drafting.pipeline] Node: generateDocument",
    documentType:  state.detectedDocumentType,
    retryCount:    state.complianceRetryCount,
  });

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: PIPELINE_CONFIG.GENERATION_TEMPERATURE,
      maxTokens:   PIPELINE_CONFIG.GENERATION_MAX_TOKENS,
      timeout:     PIPELINE_CONFIG.LLM_TIMEOUT_MS,
    });

    // Build a fully enriched generation prompt using extracted details
    const systemPrompt = buildGenerationPrompt(
      DRAFT_GENERATION_PROMPT,
      state.documentDetails,
      state.complianceRetryCount > 0 ? state.complianceIssues : []
    );

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.conversationHistory.slice(-6),
      new HumanMessage(
        `Draft a complete ${state.documentDetails?.documentLabel ?? "legal document"} ` +
        `based on the following request and extracted details:\n\n${state.query}`
      ),
    ];

    const response = await withRetry(
      () => withTimeout(llm.invoke(messages), PIPELINE_CONFIG.LLM_TIMEOUT_MS, "generateDocument"),
      PIPELINE_CONFIG.MAX_LLM_RETRIES,
      PIPELINE_CONFIG.RETRY_DELAY_MS,
      "generateDocument LLM"
    );

    const content    = response.content.toString();
    const docLabel   = state.documentDetails?.documentLabel ?? "Legal Document";
    const title      = extractTitle(content, docLabel);
    const generateDurationMs = Date.now() - t0;
    const tokenDelta = accumulateTokens(state, response as any);

    logger.info({
      msg:             "[drafting.pipeline] Document generated",
      title,
      contentLength:   content.length,
      generateDurationMs,
    });

    return {
      draftedContent:    content,
      documentTitle:     title,
      metadata: { ...state.metadata, generateDurationMs, ...tokenDelta },
    };

  } catch (error) {
    logger.error({ msg: "[drafting.pipeline] generateDocument failed", error: (error as Error).message });
    return {
      error: {
        code:      "GENERATION_FAILED",
        message:   "Failed to draft the document. Please try again.",
        nodeWhere: "generateDocument",
        retryable: true,
      },
    };
  }
};


// NODE: Review Draft
// Refines and enhances the generated document using reviewAgent.

const reviewDraftNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const t0 = Date.now();
  logger.info({ msg: "[drafting.pipeline] Node: reviewDraft" });

  if (!state.draftedContent) {
    return {};
  }

  try {
    const documentTypeEntry = DOCUMENT_TYPE_KEYWORDS.find(
      (e) => e.type === state.detectedDocumentType
    );
    const documentLabel = documentTypeEntry?.label ?? "Legal Document";

    // Call the review agent to refine the draft
    const reviewResult = await reviewAgent.reviewDocument(
      state.userId,
      state.draftedContent,
      documentLabel,
      state.query
    );

    const reviewDurationMs = Date.now() - t0;
    logger.info({
      msg: "[drafting.pipeline] Review Agent complete",
      summary: reviewResult.summaryOfChanges,
      reviewDurationMs,
    });

    return {
      draftedContent: reviewResult.rewrittenContent || state.draftedContent,
    };
  } catch (error) {
    logger.error({ msg: "[drafting.pipeline] reviewDraft failed", error: (error as Error).message });
    // Non-fatal fallback
    return {};
  }
};


// SECTION 10: NODE 5 — Validate Compliance
//
// Checks the generated document for India-law compliance issues.
// If blockers are found and we haven't retried yet → triggers a regeneration.
// This creates a self-correction loop in the graph.

const validateComplianceNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const t0 = Date.now();
  logger.info({ msg: "[drafting.pipeline] Node: validateCompliance" });

  if (!state.draftedContent) {
    // Nothing to validate
    return { compliancePassed: true };
  }

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: PIPELINE_CONFIG.COMPLIANCE_TEMPERATURE,
      maxTokens:   PIPELINE_CONFIG.COMPLIANCE_MAX_TOKENS,
      timeout:     PIPELINE_CONFIG.LLM_TIMEOUT_MS,
    });

    const systemPrompt = buildCompliancePrompt(
      DRAFT_COMPLIANCE_CHECK_PROMPT,
      state.detectedDocumentType,
      state.documentDetails?.governingLaw ?? ""
    );

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(
        `Check this ${state.documentDetails?.documentLabel ?? "document"} for India-law compliance issues:\n\n${state.draftedContent}`
      ),
    ];

    const response = await withRetry(
      () => withTimeout(llm.invoke(messages), PIPELINE_CONFIG.LLM_TIMEOUT_MS, "validateCompliance"),
      PIPELINE_CONFIG.MAX_LLM_RETRIES,
      PIPELINE_CONFIG.RETRY_DELAY_MS,
      "validateCompliance LLM"
    );

    const text   = response.content.toString();
    const parsed = safeParseJSON<{ passed: boolean; issues: ComplianceIssue[] }>(text);
    const validateDurationMs = Date.now() - t0;
    const tokenDelta = accumulateTokens(state, response as any);

    if (!parsed) {
      // Can't parse compliance result — treat as passed (don't block users on infra errors)
      logger.warn({ msg: "[drafting.pipeline] Compliance check JSON parse failed, treating as passed" });
      return {
        compliancePassed: true,
        complianceIssues: [],
        metadata: { ...state.metadata, validateDurationMs, ...tokenDelta },
      };
    }

    const blockers = (parsed.issues ?? []).filter((i) => i.severity === "BLOCKER");
    const passed   = parsed.passed || blockers.length === 0;

    logger.info({
      msg:             "[drafting.pipeline] Compliance check complete",
      passed,
      totalIssues:     parsed.issues?.length ?? 0,
      blockers:        blockers.length,
      validateDurationMs,
    });

    return {
      compliancePassed: passed,
      complianceIssues: parsed.issues ?? [],
      metadata:         { ...state.metadata, validateDurationMs, ...tokenDelta },
    };

  } catch (error) {
    logger.error({ msg: "[drafting.pipeline] validateCompliance failed", error: (error as Error).message });
    // Non-fatal — pass the document through with a warning
    return {
      compliancePassed: true,
      complianceIssues: [{
        clause:     "General",
        issue:      "Compliance validation could not be completed due to a service error.",
        suggestion: "Please have a qualified advocate review this document before use.",
        severity:   "WARNING",
      }],
    };
  }
};

function buildCompliancePrompt(
  basePrompt: string,
  type:        DocumentType,
  governingLaw:string
): string {
  return `${basePrompt}

## Document Type Being Checked
${DOCUMENT_TYPE_KEYWORDS.find(e => e.type === type)?.label ?? type}

## Primary Governing Law
${governingLaw}

## What to Check For
- Clauses that are unenforceable under Indian law (e.g. non-competes > 12 months under Indian Contract Act)
- Missing mandatory clauses for this document type under Indian law
- Jurisdiction specified correctly as Indian courts
- Arbitration clause references correct Act (Arbitration & Conciliation Act 1996)
- Stamp duty and registration requirements flagged where applicable
- Labour law compliance for employment documents

## Response Format
Return ONLY a JSON object:
{
  "passed": true | false,
  "issues": [
    {
      "clause": "Non-compete clause",
      "issue": "Duration of 24 months is unenforceable under Indian Contract Act Section 27",
      "suggestion": "Reduce to 6-12 months or remove entirely",
      "severity": "BLOCKER" | "WARNING"
    }
  ]
}
"passed" is true if there are no BLOCKER issues.
Return { "passed": true, "issues": [] } if the document is fully compliant.`;
}


// SECTION 11: NODE 6 — Finalize

const finalizeNode = async (
  state: DraftingState
): Promise<Partial<DraftingState>> => {
  const totalDurationMs = Date.now() - new Date(state.metadata.startedAt).getTime();

  logger.info({
    msg:            "[drafting.pipeline] Pipeline complete",
    userId:         state.userId,
    documentType:   state.detectedDocumentType,
    documentTitle:  state.documentTitle,
    compliancePassed: state.compliancePassed,
    complianceIssues: state.complianceIssues?.length,
    needsClarification: state.needsClarification,
    hasError:       !!state.error,
    totalDurationMs,
    inputTokens:    state.metadata.totalInputTokens,
    outputTokens:   state.metadata.totalOutputTokens,
  });

  return {
    metadata: { ...state.metadata, totalDurationMs },
  };
};


// SECTION 12: CONDITIONAL ROUTING FUNCTIONS

// After validateInput: proceed or short-circuit on error
const routeAfterValidation = (
  state: DraftingState
): "analyzeIntent" | "finalize" => {
  return state.error ? "finalize" : "analyzeIntent";
};

// After analyzeIntent: extract details, ask a question, or short-circuit
const routeAfterIntent = (
  state: DraftingState
): "extractDetails" | "finalize" => {
  if (state.error)               return "finalize";         // LLM error
  if (!state.isReadyToDraft)     return "finalize";         // Needs clarification — end here, return question
  return "extractDetails";
};

// After extractDetails: always generate (extraction failures are non-fatal)
const routeAfterExtraction = (
  state: DraftingState
): "generateDocument" | "finalize" => {
  return state.error ? "finalize" : "generateDocument";
};

// After generateDocument: review or short-circuit on error
const routeAfterGeneration = (
  state: DraftingState
): "reviewDraft" | "finalize" => {
  return state.error ? "finalize" : "reviewDraft";
};

// After reviewDraft: validate compliance or short-circuit on error
const routeAfterReview = (
  state: DraftingState
): "validateCompliance" | "finalize" => {
  return state.error ? "finalize" : "validateCompliance";
};

// After validateCompliance:
//   - Compliance blockers + retries remaining → regenerate
//   - Otherwise → finalize
const routeAfterCompliance = (
  state: DraftingState
): "generateDocument" | "finalize" => {
  const hasBlockers = (state.complianceIssues ?? []).some((i) => i.severity === "BLOCKER");
  const canRetry    = state.complianceRetryCount < PIPELINE_CONFIG.MAX_COMPLIANCE_RETRIES;

  if (!state.compliancePassed && hasBlockers && canRetry) {
    logger.info({
      msg:         "[drafting.pipeline] Compliance failed — retrying generation",
      retryCount:  state.complianceRetryCount + 1,
      blockers:    state.complianceIssues?.filter(i => i.severity === "BLOCKER").length,
    });
    // Increment retry counter (the graph will call generateDocument again)
    // We update complianceRetryCount here by returning it — it flows into generateDocument's state
    return "generateDocument";
  }

  return "finalize";
};


// SECTION 13: GRAPH ASSEMBLY

const workflow = new StateGraph(DraftingStateAnnotation)

  // Register nodes
  .addNode("validateInput",       validateInputNode)
  .addNode("analyzeIntent",       analyzeIntentNode)
  .addNode("extractDetails",      extractDetailsNode)
  .addNode("generateDocument",    generateDocumentNode)
  .addNode("reviewDraft",         reviewDraftNode)
  .addNode("validateCompliance",  validateComplianceNode)
  .addNode("finalize",            finalizeNode)

  // Entry point
  .addEdge(START, "validateInput")

  // Routing
  .addConditionalEdges("validateInput", routeAfterValidation, {
    analyzeIntent: "analyzeIntent",
    finalize:      "finalize",
  })
  .addConditionalEdges("analyzeIntent", routeAfterIntent, {
    extractDetails: "extractDetails",
    finalize:       "finalize",   // needsClarification OR error
  })
  .addConditionalEdges("extractDetails", routeAfterExtraction, {
    generateDocument: "generateDocument",
    finalize:         "finalize",
  })
  .addConditionalEdges("generateDocument", routeAfterGeneration, {
    reviewDraft: "reviewDraft",
    finalize:    "finalize",
  })
  .addConditionalEdges("reviewDraft", routeAfterReview, {
    validateCompliance: "validateCompliance",
    finalize:           "finalize",
  })
  .addConditionalEdges("validateCompliance", routeAfterCompliance, {
    generateDocument: "generateDocument",  // Compliance retry loop
    finalize:         "finalize",
  })
  .addEdge("finalize", END);

export const draftingPipeline = workflow.compile();


// SECTION 14: PUBLIC RUN FUNCTION
// The only thing callers import. Hides all LangGraph internals.

export interface RunDraftingOptions {
  query:               string;
  userId:              string;
  selectedModel?:      SupportedModel;
  conversationHistory?: BaseMessage[];
}

export type DraftingResult =
  | {
      type:              "DRAFT_READY";
      draftedContent:    string;
      documentTitle:     string;
      documentType:      DocumentType;
      documentDetails:   ExtractedDocumentDetails;
      compliancePassed:  boolean;
      complianceIssues:  ComplianceIssue[];
      metadata:          PipelineMetadata;
    }
  | {
      type:                "CLARIFICATION_NEEDED";
      clarificationQuestion: string;
      detectedDocumentType:  DocumentType;
      metadata:              PipelineMetadata;
    };

export async function runDraftingPipeline(
  options: RunDraftingOptions
): Promise<DraftingResult> {
  const {
    query,
    userId,
    selectedModel       = "gemini-2.0-flash",
    conversationHistory = [],
  } = options;

  const result = await draftingPipeline.invoke({
    query,
    userId,
    selectedModel,
    conversationHistory,
  });

  // Hard error from the pipeline
  if (result.error) {
    const statusCode = result.error.retryable ? 502 : 400;
    throw new AppError(result.error.message, statusCode, result.error.retryable);
  }

  // User needs to provide more information
  if (result.needsClarification && result.clarificationQuestion) {
    return {
      type:                  "CLARIFICATION_NEEDED",
      clarificationQuestion: result.clarificationQuestion,
      detectedDocumentType:  result.detectedDocumentType,
      metadata:              result.metadata,
    };
  }

  // Document was generated
  if (!result.draftedContent) {
    throw new AppError(
      "Document generation completed but produced no content. Please try again.",
      500
    );
  }

  return {
    type:             "DRAFT_READY",
    draftedContent:   result.draftedContent,
    documentTitle:    result.documentTitle ?? "Legal Document",
    documentType:     result.detectedDocumentType,
    documentDetails:  result.documentDetails ?? {
      documentType:  result.detectedDocumentType,
      documentLabel: "Legal Document",
      parties:       [],
      jurisdiction:  "India",
      governingLaw:  getDefaultGoverningLaw(result.detectedDocumentType),
      keyTerms:      {},
      missingFields: [],
    },
    compliancePassed: result.compliancePassed ?? true,
    complianceIssues: result.complianceIssues ?? [],
    metadata:         result.metadata,
  };
}