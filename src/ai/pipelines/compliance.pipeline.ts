// src/ai/pipelines/compliance.pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Compliance Pipeline (Production Grade)
// Uses: LangGraph, Hallucination Guard, Structured JSON output
// Flow: validateInput → generateChecklist → parseChecklist
//        → verifyCitations → finalize
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getLLM } from '../providers/llm.factory';
import { hallucinationGuard } from '../guards/hallucination.guard';
import { COMPLIANCE_SYSTEM_PROMPT } from '../prompts/shared/base.prompt';
import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';
import { SupportedModel } from '../../config/llm.config';
import type { VerifiedCitation, ConfidenceLevel } from '../guards/hallucination.guard';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BusinessProfile {
  businessType:  string;   // e.g. "SaaS Startup", "Restaurant"
  state:         string;   // e.g. "Karnataka", "Maharashtra"
  headcount:     number;   // Employee count
  revenueBracket: string;  // e.g. "₹20L-1Cr"
  hasUserData?:  boolean;  // DPDP applicability
  isFood?:       boolean;  // FSSAI applicability
  isFintech?:    boolean;  // RBI/SEBI applicability
}

export interface ComplianceChecklistItem {
  category:    string;
  priority:    'URGENT' | 'THIS_QUARTER' | 'OPTIONAL';
  title:       string;
  law:         string;
  section?:    string;
  requirement: string;
  deadline?:   string;
  penalty?:    string;
  action?:     string;
}

export interface ParsedChecklist {
  title:        string;
  summary:      string;
  generatedAt:  string;
  items:        ComplianceChecklistItem[];
  disclaimer?:  string;
}

const PIPELINE_CONSTANTS = {
  MAX_RETRIES:    2,
  RETRY_DELAY_MS: 1000,
  LLM_TIMEOUT_MS: 60_000, // Compliance lists can be long
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: STATE DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceStateAnnotation = Annotation.Root({
  // INPUT
  businessProfile: Annotation<BusinessProfile>({
    reducer: (_, next) => next,
    default: () => ({ businessType: '', state: '', headcount: 0, revenueBracket: '' }),
  }),
  selectedModel: Annotation<SupportedModel>({
    reducer: (_, next) => next,
    default: () => 'gemini-2.0-flash',
  }),
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // INTERMEDIATE
  rawLLMResponse: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  parsedChecklist: Annotation<ParsedChecklist | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // OUTPUT
  citationsVerified: Annotation<VerifiedCitation[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  confidenceScore: Annotation<number>({
    reducer: (_, next) => next ?? 1.0,
    default: () => 1.0,
  }),
  confidenceLevel: Annotation<ConfidenceLevel>({
    reducer: (_, next) => next ?? 'HIGH',
    default: () => 'HIGH' as ConfidenceLevel,
  }),
  finalChecklist: Annotation<ParsedChecklist | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ERROR
  error: Annotation<{ code: string; message: string; retryable: boolean } | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // METADATA
  metadata: Annotation<{
    startedAt:       string;
    llmDurationMs:   number;
    guardDurationMs: number;
    totalDurationMs: number;
    inputTokens:     number;
    outputTokens:    number;
  }>({
    reducer: (current, next) => ({ ...current, ...next }),
    default: () => ({
      startedAt:       new Date().toISOString(),
      llmDurationMs:   0,
      guardDurationMs: 0,
      totalDurationMs: 0,
      inputTokens:     0,
      outputTokens:    0,
    }),
  }),
});

export type ComplianceState = typeof ComplianceStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: RETRY HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, delayMs: number, ctx: string): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err as Error;
      logger.warn({ msg: `[compliance.pipeline] ${ctx} attempt ${attempt} failed`, error: lastError.message });
      if (attempt <= maxRetries) await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: NODES
// ─────────────────────────────────────────────────────────────────────────────

// Node A: Validate Input
const validateInputNode = async (
  state: ComplianceState
): Promise<Partial<ComplianceState>> => {
  logger.info({ msg: '[compliance.pipeline] Node: validateInput', userId: state.userId });

  const { businessType, state: bizState, headcount } = state.businessProfile;

  if (!businessType?.trim()) {
    return { error: { code: 'MISSING_BUSINESS_TYPE', message: 'Please provide your business type (e.g., SaaS Startup, Restaurant).', retryable: false } };
  }
  if (!bizState?.trim()) {
    return { error: { code: 'MISSING_STATE', message: 'Please provide the state where your business operates.', retryable: false } };
  }
  if (typeof headcount !== 'number' || headcount < 0) {
    return { error: { code: 'INVALID_HEADCOUNT', message: 'Please provide a valid employee headcount.', retryable: false } };
  }

  return {};
};

// Node B: Generate Checklist via LLM
const generateChecklistNode = async (
  state: ComplianceState
): Promise<Partial<ComplianceState>> => {
  const llmStart = Date.now();
  logger.info({ msg: '[compliance.pipeline] Node: generateChecklist', model: state.selectedModel });

  const { businessType, state: bizState, headcount, revenueBracket, hasUserData, isFood, isFintech } = state.businessProfile;

  // Build business context string to inject into the system prompt
  const businessContext = `
Business Type:    ${businessType}
State:            ${bizState}
Employee Count:   ${headcount}
Revenue Bracket:  ${revenueBracket || 'Not specified'}
Handles User Data: ${hasUserData ? 'Yes (DPDP Act applies)' : 'No'}
Food Business:    ${isFood ? 'Yes (FSSAI applies)' : 'No'}
Fintech/Finance:  ${isFintech ? 'Yes (RBI/SEBI applies)' : 'No'}
  `.trim();

  const systemPrompt = COMPLIANCE_SYSTEM_PROMPT.replace('{{BUSINESS_CONTEXT}}', businessContext);

  // Build human message — explicitly ask for JSON
  const userMessage = `Generate a complete compliance checklist for this business profile. Return ONLY valid JSON, no other text.

Business Profile:
${businessContext}`;

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: 0.0,  // Zero temperature = deterministic JSON
      maxTokens:   4000, // Compliance lists can have many items
      timeout:     PIPELINE_CONSTANTS.LLM_TIMEOUT_MS,
    });

    const response = await withRetry(
      () => llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ]),
      PIPELINE_CONSTANTS.MAX_RETRIES,
      PIPELINE_CONSTANTS.RETRY_DELAY_MS,
      'LLM.invoke'
    );

    const llmDurationMs = Date.now() - llmStart;
    const rawText       = response.content.toString();
    const usage         = (response as any).usage_metadata ?? {};

    logger.info({ msg: '[compliance.pipeline] LLM response received', durationMs: llmDurationMs, length: rawText.length });

    return {
      rawLLMResponse: rawText,
      metadata: {
        ...state.metadata,
        llmDurationMs,
        inputTokens:  usage.input_tokens  ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      },
    };
  } catch (err) {
    logger.error({ msg: '[compliance.pipeline] generateChecklist failed', error: (err as Error).message });
    return { error: { code: 'LLM_CALL_FAILED', message: 'The AI service is temporarily unavailable. Please try again.', retryable: true } };
  }
};

// Node C: Parse and validate the JSON checklist
const parseChecklistNode = async (
  state: ComplianceState
): Promise<Partial<ComplianceState>> => {
  logger.info({ msg: '[compliance.pipeline] Node: parseChecklist' });

  if (!state.rawLLMResponse) {
    return { error: { code: 'NO_LLM_RESPONSE', message: 'No response received from AI.', retryable: true } };
  }

  try {
    // Extract JSON from LLM response — LLMs sometimes wrap JSON in markdown code blocks
    let jsonString = state.rawLLMResponse.trim();

    // Strip ```json ... ``` or ``` ... ``` wrappers if present
    const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonString = jsonMatch[1];

    const parsed: ParsedChecklist = JSON.parse(jsonString);

    // Validate required fields
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Parsed JSON missing required "items" array');
    }

    logger.info({
      msg:       '[compliance.pipeline] Checklist parsed',
      itemCount:  parsed.items.length,
      urgent:     parsed.items.filter(i => i.priority === 'URGENT').length,
    });

    return { parsedChecklist: parsed };
  } catch (parseErr) {
    logger.error({
      msg:   '[compliance.pipeline] JSON parse failed',
      error: (parseErr as Error).message,
      raw:   state.rawLLMResponse?.slice(0, 200),
    });

    // Graceful degradation: wrap raw text in a fallback structure
    const fallback: ParsedChecklist = {
      title:       `Compliance Report — ${state.businessProfile.businessType}`,
      summary:     'Compliance checklist generated (JSON parse error — showing raw output).',
      generatedAt: new Date().toISOString(),
      items:       [],
      disclaimer:  state.rawLLMResponse ?? '',
    };

    return { parsedChecklist: fallback };
  }
};

// Node D: Verify Citations via Hallucination Guard
const verifyCitationsNode = async (
  state: ComplianceState
): Promise<Partial<ComplianceState>> => {
  const guardStart = Date.now();
  logger.info({ msg: '[compliance.pipeline] Node: verifyCitations' });

  if (!state.parsedChecklist) {
    return { finalChecklist: state.parsedChecklist };
  }

  // Run guard on the summary text (not the JSON — guard is for prose text)
  const textToVerify = [
    state.parsedChecklist.summary,
    ...state.parsedChecklist.items.map(i =>
      `${i.law}${i.section ? `, Section ${i.section}` : ''}: ${i.requirement}`
    ),
  ].join('\n');

  try {
    const guardResult = await hallucinationGuard.run(textToVerify, {
      skipKanoonVerification: false,
      annotateInlineMarkers:  false,
      verbose:                false,
    });

    logger.info({
      msg:            '[compliance.pipeline] Guard complete',
      confidence:     guardResult.confidenceLevel,
      verifiedCount:  guardResult.verifiedCount,
      totalCount:     guardResult.totalCount,
    });

    return {
      citationsVerified: guardResult.citationsVerified,
      confidenceScore:   guardResult.confidenceScore,
      confidenceLevel:   guardResult.confidenceLevel,
      finalChecklist:    state.parsedChecklist,
      metadata: {
        ...state.metadata,
        guardDurationMs: Date.now() - guardStart,
      },
    };
  } catch (err) {
    logger.warn({ msg: '[compliance.pipeline] Guard failed — using checklist as-is', error: (err as Error).message });
    return {
      citationsVerified: [],
      confidenceScore:   0.5,
      confidenceLevel:   'MEDIUM',
      finalChecklist:    state.parsedChecklist,
    };
  }
};

// Node E: Finalize
const finalizeNode = async (
  state: ComplianceState
): Promise<Partial<ComplianceState>> => {
  const totalDurationMs = Date.now() - new Date(state.metadata.startedAt).getTime();
  logger.info({ msg: '[compliance.pipeline] Pipeline complete', userId: state.userId, totalDurationMs });
  return { metadata: { ...state.metadata, totalDurationMs } };
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: ROUTING
// ─────────────────────────────────────────────────────────────────────────────

const shouldContinueAfterValidation = (s: ComplianceState): 'generateChecklist' | 'finalize' =>
  s.error ? 'finalize' : 'generateChecklist';

const shouldContinueAfterGenerate = (s: ComplianceState): 'parseChecklist' | 'finalize' =>
  s.error ? 'finalize' : 'parseChecklist';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: COMPILE GRAPH
// ─────────────────────────────────────────────────────────────────────────────

const workflow = new StateGraph(ComplianceStateAnnotation)
  .addNode('validateInput',     validateInputNode)
  .addNode('generateChecklist', generateChecklistNode)
  .addNode('parseChecklist',    parseChecklistNode)
  .addNode('verifyCitations',   verifyCitationsNode)
  .addNode('finalize',          finalizeNode)

  .addEdge(START, 'validateInput')
  .addConditionalEdges('validateInput', shouldContinueAfterValidation, {
    generateChecklist: 'generateChecklist',
    finalize:          'finalize',
  })
  .addConditionalEdges('generateChecklist', shouldContinueAfterGenerate, {
    parseChecklist: 'parseChecklist',
    finalize:       'finalize',
  })
  .addEdge('parseChecklist',  'verifyCitations')
  .addEdge('verifyCitations', 'finalize')
  .addEdge('finalize',        END);

export const compliancePipeline = workflow.compile();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: PUBLIC RUN FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export interface RunComplianceOptions {
  businessProfile: BusinessProfile;
  userId:          string;
  selectedModel?:  SupportedModel;
}

export interface ComplianceResult {
  checklist:         ParsedChecklist;
  citationsVerified: VerifiedCitation[];
  confidenceScore:   number;
  confidenceLevel:   ConfidenceLevel;
  metadata:          ComplianceState['metadata'];
}

export async function runCompliancePipeline(options: RunComplianceOptions): Promise<ComplianceResult> {
  const { businessProfile, userId, selectedModel = 'gemini-2.0-flash' } = options;

  const result = await compliancePipeline.invoke({ businessProfile, userId, selectedModel });

  if (result.error) {
    const status = result.error.retryable ? 502 : 400;
    throw new AppError(result.error.message, status, result.error.retryable);
  }

  if (!result.finalChecklist) {
    throw new AppError('Compliance pipeline produced no checklist. Please try again.', 500);
  }

  return {
    checklist:         result.finalChecklist,
    citationsVerified: result.citationsVerified ?? [],
    confidenceScore:   result.confidenceScore   ?? 1.0,
    confidenceLevel:   result.confidenceLevel   ?? 'HIGH',
    metadata:          result.metadata,
  };
}
