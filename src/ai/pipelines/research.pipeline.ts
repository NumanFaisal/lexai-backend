// src/ai/pipelines/research.pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// LexAI — Research Pipeline (Production Grade)
// Uses: LangGraph, LangChain, Hallucination Guard, Confidence Scoring
// Best Practices: Error handling, retries, logging, streaming, typed state
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getLLM } from "../providers/llm.factory";
import { extractCitations, ExtractedCitation } from "../../shared/helpers/citation.parser";
import { verifyWithKanoon } from "../../infrastructure/search/kanoon.client";
import { logger } from "../../config/logger";
import { AppError } from "../../shared/errors/AppError";
import { SupportedModel } from "@/config/llm.config";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: CONSTANTS
// Company best practice: Never hardcode magic numbers inline.
// Put all tunable values in one place so they are easy to adjust.
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_CONSTANTS = {
  // Confidence thresholds
  HIGH_CONFIDENCE_THRESHOLD: 0.8,   // >= 80% citations verified → HIGH
  LOW_CONFIDENCE_THRESHOLD: 0.5,    // <  50% citations verified → LOW (show warning)

  // LangGraph retry settings
  MAX_RETRIES: 2,                   // Retry LLM call up to 2 times on failure
  RETRY_DELAY_MS: 1000,             // Wait 1 second between retries

  // Timeouts (prevent hanging requests)
  LLM_TIMEOUT_MS: 30_000,           // 30s max for LLM response
  KANOON_TIMEOUT_MS: 5_000,         // 5s max per Kanoon API call

  // Kanoon verification
  KANOON_MAX_CONCURRENT: 5,         // Verify max 5 citations at once (prevents rate limiting)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: SYSTEM PROMPT
// Company best practice: System prompts are treated like code.
// They live in /src/ai/prompts/, are version-controlled, and tested.
// This one is inlined here for clarity — in production, import from prompts/.
// ─────────────────────────────────────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are LexAI, an expert AI legal assistant specializing exclusively in Indian law.

## YOUR EXPERTISE
You have deep knowledge of:
- IPC 1860 / Bharatiya Nyaya Sanhita (BNS) 2023 — all criminal offences
- CrPC 1973 / Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023 — criminal procedure
- Indian Contract Act 1872 — contracts, enforceability, remedies
- Companies Act 2013 — incorporation, compliance, directors, ROC filings
- GST Act 2017 (CGST/SGST/IGST) — registration, returns, e-invoicing
- DPDP Act 2023 — digital personal data protection, consent, fiduciary duties
- Labour Codes (4 codes) — EPF, ESIC, minimum wages, leave, termination
- Transfer of Property Act 1882 — sale, lease, mortgage, gift
- IBC 2016 — insolvency and bankruptcy, CIRP process
- Consumer Protection Act 2019 — consumer rights, forums, deficiency
- IT Act 2000 + CERT Rules — cybercrime, intermediary liability
- SEBI Regulations — fundraising, securities, disclosure
- Arbitration & Conciliation Act 1996 — arbitration clauses, enforcement

## RESPONSE FORMAT
Structure every response in this exact order:

### Summary
[2–3 sentences directly answering the question]

### Applicable Law
[List each relevant Act and section. Format: **Act Name, Section X** — [what that section says in one sentence]]

### Relevant Case Law
[List 2–3 landmark cases only if you are HIGHLY CONFIDENT they exist. Format: **Party A v. Party B (Year Court)** — [what the court held]]

### Explanation
[Plain English explanation of how the law applies to this specific situation]

### Practical Steps
[Numbered list of concrete actions the person should take]

## CRITICAL CITATION RULES — NON-NEGOTIABLE
1. ONLY cite section numbers you are certain exist in the Act
2. ONLY cite case names you are highly confident are real and correctly named
3. If uncertain about a case: write "You may want to search Indian Kanoon for cases on [topic]" — do NOT invent a case name
4. If uncertain about a section number: describe what the law says WITHOUT citing a specific number
5. NEVER fabricate citations. One wrong citation destroys user trust permanently.

## LANGUAGE
- Write in clear, plain English. Avoid unnecessary legalese.
- If the user's query is in Hindi or Hinglish: understand it fully, respond in English.
- Define legal terms when you use them: "anticipatory bail (bail granted before arrest)"

## MANDATORY DISCLAIMER
End every response with this exact line:
---
*⚖️ This is AI-generated legal information, not legal advice. Consult a qualified advocate before taking any legal action.*`;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: STATE DEFINITION
// Company best practice: Use LangGraph's Annotation API (not raw channel objects).
// Every field has a clear reducer and default value.
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchStateAnnotation = Annotation.Root({
  // INPUT — set before pipeline starts
  query: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  selectedModel: Annotation<SupportedModel>({
    reducer: (_, next) => next,
    default: () => "gpt-4o",   // Default to cheapest capable model
  }),
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  conversationHistory: Annotation<BaseMessage[]>({
    reducer: (current, next) => next ?? current,
    default: () => [],
  }),

  // INTERMEDIATE — set by nodes during execution
  draftResponse: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  retryCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // OUTPUT — set at the end of the pipeline
  citationsRaw: Annotation<ExtractedCitation[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  citationsVerified: Annotation<VerifiedCitation[]>({
    reducer: (_, next) => next ?? [],
    default: () => [],
  }),
  confidenceScore: Annotation<number>({
    reducer: (_, next) => next ?? 1.0,
    default: () => 1.0,
  }),
  confidenceLevel: Annotation<ConfidenceLevel>({
    reducer: (_, next) => next ?? "HIGH",
    default: () => "HIGH" as ConfidenceLevel,
  }),
  finalResponse: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // ERROR — set if something goes wrong
  error: Annotation<PipelineError | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // METADATA — timing and token tracking
  metadata: Annotation<PipelineMetadata>({
    reducer: (current, next) => ({ ...current, ...next }),
    default: () => ({
      startedAt: new Date().toISOString(),
      llmDurationMs: 0,
      kanoonDurationMs: 0,
      totalDurationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  }),
});

// Derive the TypeScript type from the Annotation
export type ResearchState = typeof ResearchStateAnnotation.State;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: SUPPORTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface VerifiedCitation extends ExtractedCitation {
  verified: boolean;
  kanoonUrl?: string;
  verificationError?: string;
}

interface PipelineError {
  code: string;
  message: string;
  nodeWhere: string;
  retryable: boolean;
}

interface PipelineMetadata {
  startedAt: string;
  llmDurationMs: number;
  kanoonDurationMs: number;
  totalDurationMs: number;
  inputTokens: number;
  outputTokens: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: HELPER — RETRY WITH EXPONENTIAL BACKOFF
// Company best practice: Any external API call (LLM, Kanoon) must have retry logic.
// Network failures are transient — retrying 2–3 times fixes 95% of them.
// ─────────────────────────────────────────────────────────────────────────────

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
    } catch (error) {
      lastError = error as Error;
      logger.warn({
        msg: `[research.pipeline] ${context} failed on attempt ${attempt}`,
        attempt,
        maxRetries,
        error: lastError.message,
      });

      if (attempt <= maxRetries) {
        // Exponential backoff: 1s, 2s, 4s...
        const waitMs = delayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: NODE A — Input Validation
// Company best practice: Validate at the start of every pipeline.
// Fail fast with a clear error rather than getting a confusing LLM response.
// ─────────────────────────────────────────────────────────────────────────────

const validateInputNode = async (
  state: ResearchState
): Promise<Partial<ResearchState>> => {
  logger.info({ msg: "[research.pipeline] Node: validateInput", userId: state.userId });

  const query = state.query?.trim();

  // Rule 1: Query must not be empty
  if (!query || query.length === 0) {
    return {
      error: {
        code: "EMPTY_QUERY",
        message: "Please enter a legal question.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  // Rule 2: Query must not be too short to be meaningful
  if (query.length < 10) {
    return {
      error: {
        code: "QUERY_TOO_SHORT",
        message: "Your question is too short. Please provide more details.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  // Rule 3: Query must not be too long (prevent prompt injection / excessive tokens)
  if (query.length > 5000) {
    return {
      error: {
        code: "QUERY_TOO_LONG",
        message: "Your question is too long. Please keep it under 5,000 characters.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  // Rule 4: Basic off-topic check — reject obvious non-legal queries
  // (Claude/Gemini would answer them, wasting tokens and money)
  const CLEARLY_OFF_TOPIC = [
    /recipe|cooking|food|cricket|sports|movie|song|music|weather/i,
    /how to (cook|bake|make food|play cricket)/i,
  ];
  if (CLEARLY_OFF_TOPIC.some((pattern) => pattern.test(query))) {
    return {
      error: {
        code: "OFF_TOPIC_QUERY",
        message:
          "I specialize in Indian law. Please ask a legal question about Indian Acts, cases, compliance, or contracts.",
        nodeWhere: "validateInput",
        retryable: false,
      },
    };
  }

  logger.info({ msg: "[research.pipeline] Input validated successfully", queryLength: query.length });
  return {};
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: NODE B — Generate Draft
// Calls the LLM with the system prompt + conversation history + user query.
// Company best practice: Always include conversation history for context.
// Always set a timeout. Always log token usage for cost tracking.
// ─────────────────────────────────────────────────────────────────────────────

const generateDraftNode = async (
  state: ResearchState
): Promise<Partial<ResearchState>> => {
  const llmStartTime = Date.now();
  logger.info({
    msg: "[research.pipeline] Node: generateDraft",
    model: state.selectedModel,
    userId: state.userId,
  });

  try {
    const llm = getLLM(state.selectedModel, {
      temperature: 0.1,     // Low temperature = consistent, factual responses
      maxTokens: 2000,      // Research answers should be thorough but not endless
      timeout: PIPELINE_CONSTANTS.LLM_TIMEOUT_MS,
    });

    // Build the messages array:
    // [SystemMessage, ...conversationHistory (last 6), HumanMessage]
    const messages: BaseMessage[] = [
      new SystemMessage(RESEARCH_SYSTEM_PROMPT),
      ...state.conversationHistory.slice(-6),  // Context window: last 6 messages only
      new HumanMessage(state.query),
    ];

    // Call LLM with retry logic
    const response = await withRetry(
      () => llm.invoke(messages),
      PIPELINE_CONSTANTS.MAX_RETRIES,
      PIPELINE_CONSTANTS.RETRY_DELAY_MS,
      "LLM.invoke"
    );

    const llmDurationMs = Date.now() - llmStartTime;
    const draftText = response.content.toString();

    // Extract token usage (available on most LLM providers)
    const usage = (response as any).usage_metadata ?? {};
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;

    logger.info({
      msg: "[research.pipeline] Draft generated",
      durationMs: llmDurationMs,
      inputTokens,
      outputTokens,
      draftLength: draftText.length,
    });

    return {
      draftResponse: draftText,
      metadata: {
        ...state.metadata,
        llmDurationMs,
        inputTokens,
        outputTokens,
      },
    };
  } catch (error) {
    logger.error({
      msg: "[research.pipeline] generateDraft failed after all retries",
      error: (error as Error).message,
      model: state.selectedModel,
    });

    return {
      error: {
        code: "LLM_CALL_FAILED",
        message: "The AI service is temporarily unavailable. Please try again in a moment.",
        nodeWhere: "generateDraft",
        retryable: true,
      },
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: NODE C — Hallucination Guard (Verify Citations)
// Company best practice: Run ALL verifications concurrently (Promise.all),
// but cap concurrency to avoid rate-limiting the Kanoon API.
// Never let a Kanoon failure crash the whole pipeline — gracefully degrade.
// ─────────────────────────────────────────────────────────────────────────────

const verifyCitationsNode = async (
  state: ResearchState
): Promise<Partial<ResearchState>> => {
  if (!state.draftResponse) {
    // Nothing to verify — should not happen, but handle defensively
    return { finalResponse: state.draftResponse };
  }

  const kanoonStartTime = Date.now();
  logger.info({ msg: "[research.pipeline] Node: verifyCitations", userId: state.userId });

  // Step 1: Extract all citations from the draft text using regex
  const rawCitations = extractCitations(state.draftResponse);

  logger.info({
    msg: "[research.pipeline] Citations extracted",
    count: rawCitations.length,
    citations: rawCitations.map((c) => c.rawText),
  });

  // Step 2: If no citations found, skip verification (response has no citations to verify)
  if (rawCitations.length === 0) {
    return {
      citationsRaw: [],
      citationsVerified: [],
      confidenceScore: 1.0,       // No citations = nothing to be wrong = HIGH confidence
      confidenceLevel: "HIGH",
      finalResponse: state.draftResponse,
    };
  }

  // Step 3: Verify citations against Indian Kanoon in batches
  // (Concurrency limit prevents hitting Kanoon's rate limit)
  const verifiedCitations = await verifyInBatches(
    rawCitations,
    PIPELINE_CONSTANTS.KANOON_MAX_CONCURRENT
  );

  const kanoonDurationMs = Date.now() - kanoonStartTime;

  // Step 4: Calculate confidence score
  const total = verifiedCitations.length;
  const verified = verifiedCitations.filter((c) => c.verified).length;
  const confidenceScore = total === 0 ? 1.0 : verified / total;

  // Determine confidence level using constants (not magic numbers)
  const confidenceLevel: ConfidenceLevel =
    confidenceScore >= PIPELINE_CONSTANTS.HIGH_CONFIDENCE_THRESHOLD
      ? "HIGH"
      : confidenceScore >= PIPELINE_CONSTANTS.LOW_CONFIDENCE_THRESHOLD
      ? "MEDIUM"
      : "LOW";

  logger.info({
    msg: "[research.pipeline] Citations verified",
    total,
    verified,
    confidenceScore: confidenceScore.toFixed(2),
    confidenceLevel,
    kanoonDurationMs,
  });

  // Step 5: Append appropriate disclaimer to the response based on confidence
  const finalResponse = appendConfidenceDisclaimer(
    state.draftResponse,
    confidenceLevel,
    verified,
    total
  );

  return {
    citationsRaw: rawCitations,
    citationsVerified: verifiedCitations,
    confidenceScore,
    confidenceLevel,
    finalResponse,
    metadata: {
      ...state.metadata,
      kanoonDurationMs,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: HELPER — Batch Concurrency for Kanoon Verification
// Process citations in chunks of N to avoid rate-limiting.
// Each individual citation verification has its own timeout and error handling.
// ─────────────────────────────────────────────────────────────────────────────

async function verifyInBatches(
  citations: ExtractedCitation[],
  batchSize: number
): Promise<VerifiedCitation[]> {
  const results: VerifiedCitation[] = [];

  // Chunk the citations array into batches
  for (let i = 0; i < citations.length; i += batchSize) {
    const batch = citations.slice(i, i + batchSize);

    // Verify all citations in this batch concurrently
    const batchResults = await Promise.all(
      batch.map(async (citation): Promise<VerifiedCitation> => {
        try {
          // Each Kanoon call has its own timeout to prevent one slow call from blocking others
          const verificationResult = await Promise.race([
            verifyWithKanoon(citation.rawText),
            timeout(PIPELINE_CONSTANTS.KANOON_TIMEOUT_MS),
          ]);

          // verifyWithKanoon returns {verified: boolean, kanoonUrl?: string}
          if (typeof verificationResult === "object" && verificationResult !== null) {
            return {
              ...citation,
              verified: (verificationResult as any).verified ?? false,
              kanoonUrl: (verificationResult as any).kanoonUrl,
            };
          }

          return { ...citation, verified: false };
        } catch (error) {
          // Kanoon API failed for this citation — mark as unverified but don't crash
          logger.warn({
            msg: "[research.pipeline] Kanoon verification failed for citation",
            citation: citation.rawText,
            error: (error as Error).message,
          });
          return {
            ...citation,
            verified: false,
            verificationError: (error as Error).message,
          };
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}

// Helper: Creates a promise that rejects after N milliseconds
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: HELPER — Append Confidence Disclaimer
// Company best practice: Disclaimers are data, not hardcoded strings.
// Different confidence levels get different messages.
// ─────────────────────────────────────────────────────────────────────────────

function appendConfidenceDisclaimer(
  response: string,
  level: ConfidenceLevel,
  verified: number,
  total: number
): string {
  const DISCLAIMERS: Record<ConfidenceLevel, string | null> = {
    HIGH: null, // HIGH confidence: no extra warning needed. Standard disclaimer is in system prompt.

    MEDIUM: [
      "",
      "---",
      "⚠️ *Confidence Notice:* Some citations in this response could not be fully verified",
      `against public records (${verified} of ${total} verified). Please confirm specific case`,
      "references before relying on them.",
    ].join("\n"),

    LOW: [
      "",
      "---",
      "🚨 **LOW CONFIDENCE WARNING:** A significant number of citations in this response",
      `could not be verified (${verified} of ${total} verified) against the Indian Kanoon database.`,
      "**Do not rely on this response without independent verification by a qualified advocate.**",
    ].join("\n"),
  };

  const disclaimer = DISCLAIMERS[level];
  return disclaimer ? `${response}${disclaimer}` : response;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: NODE D — Finalize
// Sets total pipeline duration in metadata.
// Company best practice: Every pipeline has a finalization step that
// records timing, logs the final result, and prepares the response for the caller.
// ─────────────────────────────────────────────────────────────────────────────

const finalizeNode = async (
  state: ResearchState
): Promise<Partial<ResearchState>> => {
  const totalDurationMs = Date.now() - new Date(state.metadata.startedAt).getTime();

  logger.info({
    msg: "[research.pipeline] Pipeline complete",
    userId: state.userId,
    confidenceLevel: state.confidenceLevel,
    confidenceScore: state.confidenceScore?.toFixed(2),
    totalDurationMs,
    inputTokens: state.metadata.inputTokens,
    outputTokens: state.metadata.outputTokens,
    citationsTotal: state.citationsVerified?.length ?? 0,
    citationsVerified: state.citationsVerified?.filter((c) => c.verified).length ?? 0,
  });

  return {
    metadata: {
      ...state.metadata,
      totalDurationMs,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: CONDITIONAL ROUTING
// Company best practice: Use conditional edges to short-circuit the pipeline
// when an error occurs rather than continuing through broken state.
// This is the key advantage of LangGraph over a simple function chain.
// ─────────────────────────────────────────────────────────────────────────────

const shouldContinueAfterValidation = (
  state: ResearchState
): "generateDraft" | "finalize" => {
  // If validation failed → skip LLM call → go straight to finalize
  // (The error is in state.error and will be returned to the caller)
  return state.error ? "finalize" : "generateDraft";
};

const shouldContinueAfterDraft = (
  state: ResearchState
): "verifyCitations" | "finalize" => {
  // If draft generation failed → skip Kanoon verification → finalize with error
  return state.error ? "finalize" : "verifyCitations";
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: COMPILE THE GRAPH
// Company best practice: Keep the graph definition clean and readable.
// Each node does ONE thing. Edges define flow. Conditional edges handle errors.
// ─────────────────────────────────────────────────────────────────────────────

const workflow = new StateGraph(ResearchStateAnnotation)

  // Register all nodes
  .addNode("validateInput",     validateInputNode)
  .addNode("generateDraft",     generateDraftNode)
  .addNode("verifyCitations",   verifyCitationsNode)
  .addNode("finalize",          finalizeNode)

  // Define flow
  .addEdge(START, "validateInput")

  // Conditional: continue or short-circuit on validation failure
  .addConditionalEdges("validateInput", shouldContinueAfterValidation, {
    generateDraft: "generateDraft",
    finalize:      "finalize",
  })

  // Conditional: continue or short-circuit on LLM failure
  .addConditionalEdges("generateDraft", shouldContinueAfterDraft, {
    verifyCitations: "verifyCitations",
    finalize:        "finalize",
  })

  // Verification always leads to finalize
  .addEdge("verifyCitations", "finalize")
  .addEdge("finalize", END);

export const researchPipeline = workflow.compile();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: PUBLIC RUN FUNCTION
// Company best practice: Don't expose the compiled graph directly to callers.
// Wrap it in a typed function that handles the result and throws proper errors.
// Callers should never have to understand LangGraph internals.
// ─────────────────────────────────────────────────────────────────────────────

export interface RunResearchOptions {
  query: string;
  userId: string;
  selectedModel?: SupportedModel;
  conversationHistory?: BaseMessage[];
}

export interface ResearchResult {
  finalResponse: string;
  citationsVerified: VerifiedCitation[];
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  metadata: PipelineMetadata;
}

export async function runResearchPipeline(
  options: RunResearchOptions
): Promise<ResearchResult> {
  const {
    query,
    userId,
    selectedModel = "gemini-2.0-flash",
    conversationHistory = [],
  } = options;

  // Run the compiled LangGraph pipeline
  const result = await researchPipeline.invoke({
    query,
    userId,
    selectedModel,
    conversationHistory,
  });

  // If pipeline set an error, throw it as a proper AppError
  // so Express error middleware handles it with the right HTTP status code
  if (result.error) {
    const statusCode = result.error.retryable ? 502 : 400;
    // AppError constructor expects (message, statusCode, retryable?)
    // result.error.code is a string; pass retryable boolean instead to match signature
    throw new AppError(result.error.message, statusCode, result.error.retryable);
  }

  // Ensure we always have a final response
  if (!result.finalResponse) {
    throw new AppError(
      "The pipeline completed but produced no response. Please try again.",
      500,
    );
  }

  return {
    finalResponse: result.finalResponse,
    citationsVerified: result.citationsVerified ?? [],
    confidenceScore: result.confidenceScore ?? 1.0,
    confidenceLevel: result.confidenceLevel ?? "HIGH",
    metadata: result.metadata,
  };
}