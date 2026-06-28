// src/ai/pipelines/case-analysis.pipeline.ts


import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getLLM } from '../providers/llm.factory';
import { hallucinationGuard } from '../guards/hallucination.guard';
import { EmbeddingProvider } from '../embeddings/embeddings.provider';
import { VectorStore, PrecedentSearchResult } from '../embeddings/vector.store';
import { CASE_ANALYSIS_SYSTEM_PROMPT } from '../prompts/shared/base.prompt';
import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';
import { SupportedModel } from '../../config/llm.config';
import { InputGuard } from '../guards/input.guard';
import type { VerifiedCitation, ConfidenceLevel } from '../guards/hallucination.guard';
import { searchKanoonPrecedents, KanoonSearchResult } from '../../infrastructure/search/kanoon.client';

// SECTION 1: CONSTANTS

const PIPELINE_CONSTANTS = {
  MAX_RETRIES:          2,
  RETRY_DELAY_MS:       1000,
  LLM_TIMEOUT_MS:       45_000,   // IRAC analysis takes longer than research
  MAX_PRECEDENTS:       3,         // RAG: top N precedents to inject
  MIN_SIMILARITY:       0.4,       // RAG: ignore weak matches below this score

  // Kanoon search fallback
  KANOON_SEARCH_TIMEOUT_MS:   5_000,   // 5s max for Kanoon search API call
  KANOON_SEARCH_MAX_RESULTS:  3,       // Max precedents to fetch from Kanoon
} as const;


// SECTION 2: STATE DEFINITION

export const CaseAnalysisStateAnnotation = Annotation.Root({
  // INPUT
  query: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  selectedModel: Annotation<SupportedModel>({
    reducer: (_, next) => next,
    default: () => 'gpt-4o',
  }),
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (current, next) => next ?? current,
    default: () => [],
  }),

  // INTERMEDIATE
  queryEmbedding: Annotation<number[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  caseId: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  caseFacts: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  precedents: Annotation<PrecedentSearchResult[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  kanoonPrecedents: Annotation<KanoonSearchResult[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  draftResponse: Annotation<string | undefined>({
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
  finalResponse: Annotation<string | undefined>({
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
    startedAt: string;
    llmDurationMs: number;
    ragDurationMs: number;
    kanoonDurationMs: number;
    guardDurationMs: number;
    totalDurationMs: number;
    inputTokens: number;
    outputTokens: number;
    precedentsFound: number;
    kanoonPrecedentsFound: number;
  }>({
    reducer: (current, next) => ({ ...current, ...next }),
    default: () => ({
      startedAt:             new Date().toISOString(),
      llmDurationMs:         0,
      ragDurationMs:         0,
      kanoonDurationMs:      0,
      guardDurationMs:       0,
      totalDurationMs:       0,
      inputTokens:           0,
      outputTokens:          0,
      precedentsFound:       0,
      kanoonPrecedentsFound: 0,
    }),
  }),
});

export type CaseAnalysisState = typeof CaseAnalysisStateAnnotation.State;


// SECTION 3: RETRY HELPER

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number,
  context: string
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      logger.warn({ msg: `[case-analysis.pipeline] ${context} attempt ${attempt} failed`, error: lastError.message });
      if (attempt <= maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
}

// SECTION 4: NODES

// Node A: Validate Input
const validateInputNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  logger.info({ msg: '[case-analysis.pipeline] Node: validateInput', userId: state.userId });

  const query = state.query?.trim();
  if (!query || query.length === 0) {
    return { error: { code: 'EMPTY_QUERY', message: 'Please describe the case or legal issue.', retryable: false } };
  }

  // Run Input Guard Validation
  try {
    InputGuard.validate(query);
  } catch (err) {
    if (err instanceof AppError) {
      return {
        error: {
          code: 'INPUT_GUARD_BLOCKED',
          message: err.message,
          retryable: false,
        },
      };
    }
    throw err;
  }
  if (query.length < 10) {
    return { error: { code: 'QUERY_TOO_SHORT', message: 'Please provide more details about the case.', retryable: false } };
  }
  if (query.length > 10_000) {
    return { error: { code: 'QUERY_TOO_LONG', message: 'Case description is too long. Please keep it under 10,000 characters.', retryable: false } };
  }

  return {};
};

// Node B: Embed Query for RAG
const embedQueryNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  const ragStart = Date.now();
  logger.info({ msg: '[case-analysis.pipeline] Node: embedQuery', userId: state.userId });

  try {
    const queryEmbedding = await EmbeddingProvider.embedText(state.query);
    return {
      queryEmbedding,
      metadata: { ...state.metadata, ragDurationMs: Date.now() - ragStart },
    };
  } catch (err) {
    // RAG failure is non-fatal: we can still do case analysis without precedents
    logger.warn({
      msg: '[case-analysis.pipeline] Embedding failed — continuing without RAG',
      error: (err as Error).message,
    });
    return { queryEmbedding: undefined };
  }
};


// Node C1: Retrieve Case Facts (from uploaded PDF)
const retrieveCaseFactsNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  if (!state.queryEmbedding || !state.caseId) {
    return { caseFacts: undefined };
  }

  logger.info({ msg: '[case-analysis.pipeline] Node: retrieveCaseFacts', caseId: state.caseId });

  try {
    const facts = await VectorStore.searchCaseDocuments(
      state.caseId,
      state.queryEmbedding,
      5,
      PIPELINE_CONSTANTS.MIN_SIMILARITY
    );

    const caseFacts = facts.length > 0 
      ? facts.map(f => f.content).join('\n\n') 
      : undefined;

    return { caseFacts };
  } catch (err) {
    logger.warn({
      msg: '[case-analysis.pipeline] Case facts search failed',
      error: (err as Error).message,
    });
    return { caseFacts: undefined };
  }
};

// Node C2: Retrieve Precedents (RAG)
const retrievePrecedentsNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  if (!state.queryEmbedding) {
    // No embedding → skip RAG → no precedents
    return { precedents: [] };
  }

  logger.info({ msg: '[case-analysis.pipeline] Node: retrievePrecedents', userId: state.userId });

  try {
    const precedents = await VectorStore.searchSimilarPrecedents(
      state.queryEmbedding,
      PIPELINE_CONSTANTS.MAX_PRECEDENTS,
      PIPELINE_CONSTANTS.MIN_SIMILARITY
    );

    logger.info({
      msg: '[case-analysis.pipeline] Precedents retrieved',
      count: precedents.length,
      titles: precedents.map(p => p.title.slice(0, 50)),
    });

    return {
      precedents,
      metadata: { ...state.metadata, precedentsFound: precedents.length },
    };
  } catch (err) {
    logger.warn({
      msg: '[case-analysis.pipeline] Vector search failed — continuing without precedents',
      error: (err as Error).message,
    });
    return { precedents: [] };
  }
};

// Node D: Search Kanoon Fallback
// If local vector search found fewer than MAX_PRECEDENTS, search Indian Kanoon
// for additional case law to inject into the IRAC prompt.
const searchKanoonFallbackNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  const localCount = state.precedents.length;

  // If local RAG already found enough precedents, skip Kanoon entirely
  if (localCount >= PIPELINE_CONSTANTS.MAX_PRECEDENTS) {
    logger.info({
      msg: '[case-analysis.pipeline] Node: searchKanoonFallback — SKIPPED (enough local precedents)',
      localPrecedents: localCount,
    });
    return { kanoonPrecedents: [] };
  }

  const kanoonStart = Date.now();
  const remainingSlots = PIPELINE_CONSTANTS.KANOON_SEARCH_MAX_RESULTS - localCount;

  logger.info({
    msg: '[case-analysis.pipeline] Node: searchKanoonFallback — searching Kanoon',
    localPrecedents: localCount,
    remainingSlots,
    userId: state.userId,
  });

  try {
    // Race the Kanoon search against a timeout to prevent blocking the pipeline
    const kanoonResults = await Promise.race([
      searchKanoonPrecedents(state.query, remainingSlots),
      new Promise<KanoonSearchResult[]>((_, reject) =>
        setTimeout(() => reject(new Error('Kanoon search timeout')), PIPELINE_CONSTANTS.KANOON_SEARCH_TIMEOUT_MS)
      ),
    ]);

    const kanoonDurationMs = Date.now() - kanoonStart;

    logger.info({
      msg: '[case-analysis.pipeline] Kanoon search complete',
      resultsFound: kanoonResults.length,
      durationMs: kanoonDurationMs,
      titles: kanoonResults.map(r => r.title.slice(0, 60)),
    });

    return {
      kanoonPrecedents: kanoonResults,
      metadata: {
        ...state.metadata,
        kanoonDurationMs,
        kanoonPrecedentsFound: kanoonResults.length,
      },
    };
  } catch (err) {
    // Kanoon failure is non-fatal — continue without external precedents
    logger.warn({
      msg: '[case-analysis.pipeline] Kanoon fallback failed — continuing without external precedents',
      error: (err as Error).message,
      durationMs: Date.now() - kanoonStart,
    });
    return {
      kanoonPrecedents: [],
      metadata: {
        ...state.metadata,
        kanoonDurationMs: Date.now() - kanoonStart,
        kanoonPrecedentsFound: 0,
      },
    };
  }
};

// Node E: Generate IRAC Analysis
const generateIRACNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  const llmStart = Date.now();
  logger.info({ msg: '[case-analysis.pipeline] Node: generateIRAC', model: state.selectedModel });

  // Build RAG context string from BOTH sources
  const ragParts: string[] = [];

  // Case Facts (from uploaded PDF)
  if (state.caseFacts) {
    ragParts.push(`[UPLOADED CASE FACTS]\n${state.caseFacts}`);
  }

  // Local precedents (from pgvector)
  if (state.precedents.length > 0) {
    state.precedents.forEach((p, i) => {
      ragParts.push(
        `[Local DB — Precedent ${i + 1}]\nCase: ${p.title}\nSimilarity: ${(p.similarity * 100).toFixed(0)}%\nFacts/Holding: ${p.content.slice(0, 800)}`
      );
    });
  }

  // Kanoon precedents (from Indian Kanoon API fallback)
  if (state.kanoonPrecedents.length > 0) {
    state.kanoonPrecedents.forEach((k, i) => {
      ragParts.push(
        `[Indian Kanoon — Result ${i + 1}]\nCase: ${k.title}\nSource: ${k.kanoonUrl}\nSummary: ${k.snippet.slice(0, 800)}`
      );
    });
  }

  const ragContextString = ragParts.length > 0
    ? ragParts.join('\n\n')
    : 'No relevant precedents retrieved from the database or Indian Kanoon. Rely on your knowledge of Indian case law, but follow citation discipline strictly.';

  // Inject RAG context into the system prompt
  const systemPromptWithRAG = CASE_ANALYSIS_SYSTEM_PROMPT.replace(
    '{{RAG_CONTEXT}}',
    ragContextString
  );

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: 0.1,   // Low = analytical precision
      maxTokens:   3000,  // IRAC is verbose by design
      timeout:     PIPELINE_CONSTANTS.LLM_TIMEOUT_MS,
    });

    const messages: BaseMessage[] = [
      new SystemMessage(systemPromptWithRAG),
      ...state.conversationHistory.slice(-6),
      new HumanMessage(state.query),
    ];

    const response = await withRetry(
      () => llm.invoke(messages),
      PIPELINE_CONSTANTS.MAX_RETRIES,
      PIPELINE_CONSTANTS.RETRY_DELAY_MS,
      'LLM.invoke'
    );

    const llmDurationMs = Date.now() - llmStart;
    const draftText     = response.content.toString();
    const usage         = (response as any).usage_metadata ?? {};

    logger.info({
      msg:       '[case-analysis.pipeline] IRAC draft generated',
      durationMs: llmDurationMs,
      length:    draftText.length,
    });

    return {
      draftResponse: draftText,
      metadata: {
        ...state.metadata,
        llmDurationMs,
        inputTokens:  usage.input_tokens  ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      },
    };
  } catch (err) {
    logger.error({
      msg:   '[case-analysis.pipeline] generateIRAC failed after retries',
      error: (err as Error).message,
    });
    return {
      error: {
        code:      'LLM_CALL_FAILED',
        message:   'The AI service is temporarily unavailable. Please try again.',
        retryable: true,
      },
    };
  }
};

// Node E: Verify Citations via Hallucination Guard
const verifyCitationsNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  if (!state.draftResponse) {
    return { finalResponse: state.draftResponse };
  }

  const guardStart = Date.now();
  logger.info({ msg: '[case-analysis.pipeline] Node: verifyCitations' });

  try {
    const guardResult = await hallucinationGuard.run(state.draftResponse, {
      skipKanoonVerification: false,
      annotateInlineMarkers:  false,
      verbose:                false,
    });

    logger.info({
      msg:            '[case-analysis.pipeline] Guard complete',
      confidence:     guardResult.confidenceLevel,
      verifiedCount:  guardResult.verifiedCount,
      totalCount:     guardResult.totalCount,
      durationMs:     guardResult.durationMs,
    });

    return {
      citationsVerified: guardResult.citationsVerified,
      confidenceScore:   guardResult.confidenceScore,
      confidenceLevel:   guardResult.confidenceLevel,
      finalResponse:     guardResult.annotatedResponse,
      metadata: {
        ...state.metadata,
        guardDurationMs: Date.now() - guardStart,
      },
    };
  } catch (err) {
    // Guard failure is non-fatal
    logger.warn({ msg: '[case-analysis.pipeline] Guard failed — using draft as-is', error: (err as Error).message });
    return {
      citationsVerified: [],
      confidenceScore:   0.5,
      confidenceLevel:   'MEDIUM',
      finalResponse:     state.draftResponse,
    };
  }
};

// Node G: Finalize
const finalizeNode = async (
  state: CaseAnalysisState
): Promise<Partial<CaseAnalysisState>> => {
  const totalDurationMs = Date.now() - new Date(state.metadata.startedAt).getTime();

  logger.info({
    msg:                    '[case-analysis.pipeline] Pipeline complete',
    userId:                 state.userId,
    confidenceLevel:        state.confidenceLevel,
    totalDurationMs,
    localPrecedentsUsed:    state.metadata.precedentsFound,
    kanoonPrecedentsUsed:   state.metadata.kanoonPrecedentsFound,
  });

  return {
    metadata: { ...state.metadata, totalDurationMs },
  };
};


// SECTION 5: CONDITIONAL ROUTING

const shouldContinueAfterValidation = (
  state: CaseAnalysisState
): 'embedQuery' | 'finalize' => state.error ? 'finalize' : 'embedQuery';

const shouldContinueAfterIRAC = (
  state: CaseAnalysisState
): 'verifyCitations' | 'finalize' => state.error ? 'finalize' : 'verifyCitations';

// SECTION 6: COMPILE GRAPH

const workflow = new StateGraph(CaseAnalysisStateAnnotation)
  .addNode('validateInput',          validateInputNode)
  .addNode('embedQuery',             embedQueryNode)
  .addNode('retrieveCaseFacts',      retrieveCaseFactsNode)
  .addNode('retrievePrecedents',     retrievePrecedentsNode)
  .addNode('searchKanoonFallback',   searchKanoonFallbackNode)
  .addNode('generateIRAC',           generateIRACNode)
  .addNode('verifyCitations',        verifyCitationsNode)
  .addNode('finalize',               finalizeNode)

  .addEdge(START, 'validateInput')
  .addConditionalEdges('validateInput', shouldContinueAfterValidation, {
    embedQuery: 'embedQuery',
    finalize:   'finalize',
  })
  .addEdge('embedQuery',            'retrieveCaseFacts')
  .addEdge('retrieveCaseFacts',     'retrievePrecedents')
  .addEdge('retrievePrecedents',    'searchKanoonFallback')
  .addEdge('searchKanoonFallback',  'generateIRAC')
  .addConditionalEdges('generateIRAC', shouldContinueAfterIRAC, {
    verifyCitations: 'verifyCitations',
    finalize:        'finalize',
  })
  .addEdge('verifyCitations', 'finalize')
  .addEdge('finalize',        END);

export const caseAnalysisPipeline = workflow.compile();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: PUBLIC RUN FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export interface RunCaseAnalysisOptions {
  query:               string;
  userId:              string;
  caseId?:             string;
  selectedModel?:      SupportedModel;
  conversationHistory?: BaseMessage[];
}

export interface CaseAnalysisResult {
  finalResponse:     string;
  citationsVerified: VerifiedCitation[];
  confidenceScore:   number;
  confidenceLevel:   ConfidenceLevel;
  precedentsFound:   number;
  metadata: {
    startedAt:       string;
    llmDurationMs:   number;
    ragDurationMs:   number;
    guardDurationMs: number;
    totalDurationMs: number;
    inputTokens:     number;
    outputTokens:    number;
    precedentsFound: number;
  };
}

export async function runCaseAnalysisPipeline(
  options: RunCaseAnalysisOptions
): Promise<CaseAnalysisResult> {
  const {
    query,
    userId,
    caseId,
    selectedModel       = 'gpt-4o',
    conversationHistory = [],
  } = options;

  const result = await caseAnalysisPipeline.invoke({
    query,
    userId,
    caseId,
    selectedModel,
    conversationHistory,
  });

  if (result.error) {
    const statusCode = result.error.retryable ? 502 : 400;
    throw new AppError(result.error.message, statusCode, result.error.retryable);
  }

  if (!result.finalResponse) {
    throw new AppError('Case analysis pipeline produced no response. Please try again.', 500);
  }

  const totalPrecedents = (result.metadata.precedentsFound ?? 0) + (result.metadata.kanoonPrecedentsFound ?? 0);

  return {
    finalResponse:     result.finalResponse,
    citationsVerified: (result.citationsVerified ?? []).map((c: any) => ({
      ...c,
      verified: c.status === 'VERIFIED',
    })),
    confidenceScore:   result.confidenceScore   ?? 1.0,
    confidenceLevel:   result.confidenceLevel   ?? 'HIGH',
    precedentsFound:   totalPrecedents,
    metadata: {
      ...result.metadata,
      precedentsFound: totalPrecedents,
    },
  };
}
