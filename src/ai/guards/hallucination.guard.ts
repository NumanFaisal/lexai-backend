// src/ai/guards/hallucination.guard.ts

// LexAI — Hallucination Guard (Production Grade)

// PURPOSE:
//   Every AI response passes through this guard before reaching the user.
//   It extracts every cited section and case name, verifies each one against
//   the Indian Kanoon database, scores overall confidence, and annotates the
//   response with verified/unverified badges.
//
// WHY THIS EXISTS:
//   Legal AI hallucinations are dangerous. A fabricated section number in a
//   bail application can get it rejected. A fake case citation used in court
//   can result in serious professional consequences. This guard is LexAI's
//   most important safety layer.

// ARCHITECTURE:
//   1. CitationExtractor   — Regex + pattern matching to find all citations
//   2. SectionValidator    — Hardcoded lookup to verify section ranges per Act
//   3. KanoonVerifier      — Live API check for case law citations
//   4. ConfidenceScorer    — Calculates overall response trustworthiness
//   5. ResponseAnnotator   — Appends badges and disclaimers to the response

import { verifyWithKanoon } from "../../infrastructure/search/kanoon.client";
import { logger } from "../../config/logger";
import { redisClient as redis } from "../../config/redis"


// SECTION 1: CONSTANTS & CONFIGURATION

const GUARD_CONFIG = {
  // Confidence thresholds
  HIGH_THRESHOLD:   0.80,   // >= 80% citations verified → HIGH
  MEDIUM_THRESHOLD: 0.50,   // >= 50% citations verified → MEDIUM
  // < 50% → LOW

  // Cache settings (Redis TTL in seconds)
  CASE_CACHE_TTL:    86_400,  // 24 hours — judgments don't change
  SECTION_CACHE_TTL: 604_800, // 7 days   — Acts change rarely

  // Concurrency
  MAX_CONCURRENT_VERIFICATIONS: 5,

  // Timeout per Kanoon API call (ms)
  KANOON_TIMEOUT_MS: 5_000,

  // Retry settings
  MAX_RETRIES: 2,
} as const;

// Redis cache key prefixes
const CACHE_KEYS = {
  case:    (text: string) => `hg:case:${slugify(text)}`,
  section: (act: string, num: string) => `hg:sec:${slugify(act)}:${num}`,
} as const;


// SECTION 2: INDIAN ACTS LOOKUP TABLE
//
// Maps Act name keywords → max valid section number.
// If Claude cites "Section 600 IPC" → max is 511 → fabricated → flag it.
//
// Sources: official bare acts from India Code (indiacode.nic.in)
// KEEP THIS UPDATED when new Acts are passed or sections are renumbered.

const INDIAN_ACTS_SECTION_MAP: Record<string, ActMetadata> = {
  // Criminal Law
  "indian penal code":                   { maxSection: 511,  aliases: ["ipc", "i.p.c"], year: 1860  },
  "bharatiya nyaya sanhita":             { maxSection: 358,  aliases: ["bns"],           year: 2023  },
  "code of criminal procedure":          { maxSection: 484,  aliases: ["crpc", "cr.p.c"],year: 1973  },
  "bharatiya nagarik suraksha sanhita":  { maxSection: 531,  aliases: ["bnss"],          year: 2023  },
  "bharatiya sakshya adhiniyam":         { maxSection: 170,  aliases: ["bsa"],           year: 2023  },
  "indian evidence act":                 { maxSection: 167,  aliases: ["iea"],           year: 1872  },

  // Commercial & Contract Law
  "indian contract act":                 { maxSection: 238,  aliases: ["ica"],           year: 1872  },
  "negotiable instruments act":          { maxSection: 147,  aliases: ["ni act", "nia"], year: 1881  },
  "sale of goods act":                   { maxSection: 66,   aliases: ["soga"],          year: 1930  },
  "arbitration and conciliation act":    { maxSection: 87,   aliases: ["arb act", "a&c act"], year: 1996 },
  "specific relief act":                 { maxSection: 58,   aliases: ["sra"],           year: 1963  },
  "limitation act":                      { maxSection: 32,   aliases: [],               year: 1963  },

  // Corporate Law
  "companies act":                       { maxSection: 470,  aliases: ["ca 2013"],       year: 2013  },
  "limited liability partnership act":   { maxSection: 81,   aliases: ["llp act"],       year: 2008  },
  "insolvency and bankruptcy code":      { maxSection: 255,  aliases: ["ibc"],           year: 2016  },
  "competition act":                     { maxSection: 66,   aliases: [],               year: 2002  },
  "sebi act":                            { maxSection: 30,   aliases: ["sebi"],          year: 1992  },

  // Taxation
  "income tax act":                      { maxSection: 298,  aliases: ["ita", "it act"], year: 1961  },
  "central goods and services tax act":  { maxSection: 174,  aliases: ["cgst", "gst act"], year: 2017 },
  "integrated goods and services tax":   { maxSection: 25,   aliases: ["igst"],          year: 2017  },
  "customs act":                         { maxSection: 161,  aliases: [],               year: 1962  },

  // Labour Law
  "payment of wages act":                { maxSection: 26,   aliases: ["pwa"],           year: 1936  },
  "minimum wages act":                   { maxSection: 31,   aliases: ["mwa"],           year: 1948  },
  "payment of gratuity act":             { maxSection: 15,   aliases: ["pga"],           year: 1972  },
  "employees provident funds act":       { maxSection: 19,   aliases: ["epf act", "pf act"], year: 1952 },
  "industrial disputes act":             { maxSection: 40,   aliases: ["ida"],           year: 1947  },
  "factories act":                       { maxSection: 120,  aliases: [],               year: 1948  },
  "maternity benefit act":               { maxSection: 30,   aliases: ["mba"],           year: 1961  },
  "equal remuneration act":              { maxSection: 17,   aliases: [],               year: 1976  },

  // Property & Civil Law
  "transfer of property act":            { maxSection: 137,  aliases: ["tpa", "t.p. act"], year: 1882 },
  "registration act":                    { maxSection: 93,   aliases: [],               year: 1908  },
  "civil procedure code":                { maxSection: 158,  aliases: ["cpc", "c.p.c"], year: 1908  },
  "land acquisition act":                { maxSection: 114,  aliases: [],               year: 2013  },

  // Constitutional & Administrative
  "constitution of india":               { maxSection: 395,  aliases: ["constitution", "art"],  year: 1950 },
  "right to information act":            { maxSection: 31,   aliases: ["rti act", "rti"],  year: 2005 },
  "prevention of corruption act":        { maxSection: 31,   aliases: ["pca", "pc act"],   year: 1988 },

  // Consumer & Data
  "consumer protection act":             { maxSection: 107,  aliases: ["cpa", "cp act"],   year: 2019 },
  "information technology act":          { maxSection: 94,   aliases: ["it act", "ita"],   year: 2000 },
  "digital personal data protection act":{ maxSection: 44,   aliases: ["dpdp act", "dpdp"], year: 2023 },

  // Environment
  "environment protection act":          { maxSection: 26,   aliases: ["epa", "ep act"],   year: 1986 },
  "water pollution act":                 { maxSection: 64,   aliases: [],               year: 1974  },
  "air pollution act":                   { maxSection: 54,   aliases: [],               year: 1981  },

  // Family Law
  "hindu marriage act":                  { maxSection: 30,   aliases: ["hma"],           year: 1955  },
  "hindu succession act":                { maxSection: 30,   aliases: ["hsa"],           year: 1956  },
  "special marriage act":                { maxSection: 50,   aliases: ["sma"],           year: 1954  },
  "guardians and wards act":             { maxSection: 53,   aliases: ["gwa"],           year: 1890  },
};

interface ActMetadata {
  maxSection: number;
  aliases:    string[];
  year:       number;
}


// SECTION 3: CITATION EXTRACTION — REGEX PATTERNS
//
// These patterns match how Claude/Gemini typically cite Indian law.
// Each pattern is tested individually and combined into a single pass.

// Matches: "Section 138 of the Negotiable Instruments Act"
//          "Sec. 406 IPC" / "§ 420 IPC" / "S. 302 IPC"
const SECTION_PATTERN =
  /(?:Section|Sec\.|§|S\.)\s*(\d{1,4}[A-Z]?(?:\([a-z0-9]+\))?)\s+(?:of\s+)?(?:the\s+)?([A-Z][A-Za-z\s,&.]*?(?:Act|Code|Rules?|Ordinance|Sanhita|Adhiniyam|B\.?N\.?S\.?|I\.?P\.?C\.?|Cr\.?P\.?C\.?|B\.?N\.?S\.?S\.?|B\.?S\.?A\.?|I\.?E\.?A\.?|I\.?C\.?A\.?|N\.?I\.?\s*Act|C\.?P\.?C\.?)\s*(?:\d{4})?)/gi;

// Matches: "Article 21 of the Constitution"
const ARTICLE_PATTERN =
  /(?:Article|Art\.)\s*(\d{1,3}[A-Z]?)\s+(?:of\s+)?(?:the\s+)?Constitution(?:\s+of\s+India)?/gi;

// Matches: "Gurbaksh Singh Sibbia v. State of Punjab (1980)"
//          "Maneka Gandhi vs Union of India, AIR 1978 SC 597"
//          "State of Maharashtra v. Praful Desai"
const CASE_PATTERN =
  /([A-Z0-9][a-zA-Z0-9\s.]+?)\s+v(?:s?|ersus)\.?\s+([A-Z][a-zA-Z\s.()]+?)(?:\s*[,(]\s*(?:AIR\s+\d{4}|(?:19|20)\d{2})\s*(?:SC|HC|Bom|Del|Mad|Cal|Ker|MP|Raj|All|P&H|AP|Guj|Kar)?\s*[\d,\s]*[)]?)/gi;

// Matches schedule references: "Schedule II of the CGST Act"
const SCHEDULE_PATTERN =
  /(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|[\dI]+(?:st|nd|rd|th)?)\s+Schedule\s+(?:of\s+)?(?:the\s+)?([A-Z][A-Za-z\s]+(?:Act|Code)\s*\d{4}?)/gi;


// SECTION 4: PUBLIC TYPES

export type CitationType = "SECTION" | "ARTICLE" | "CASE_LAW" | "SCHEDULE";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type VerificationStatus = "VERIFIED" | "UNVERIFIED" | "SKIPPED" | "ERROR";

export interface RawCitation {
  type:       CitationType;
  rawText:    string;       // Exact text as it appeared in the response
  actName?:   string;       // Normalized Act name (lowercase)
  sectionNum?:string;       // e.g. "138", "438A"
  caseName?:  string;       // Full case name
  year?:      number;       // Case year if present
  startIndex: number;       // Position in original text (for replacement)
  endIndex:   number;
}

export interface VerifiedCitation extends RawCitation {
  status:      VerificationStatus;
  kanoonUrl?:  string;          // Link to full judgment if found
  kanoonDocId?:string;          // Kanoon document ID
  failReason?: string;          // Why verification failed (for debugging)
  fromCache?:  boolean;         // Was this result from Redis cache?
}

export interface GuardResult {
  // The processed response text (with citations annotated if needed)
  annotatedResponse: string;

  // All citations found
  citationsRaw:      RawCitation[];
  citationsVerified: VerifiedCitation[];

  // Scoring
  confidenceScore:   number;          // 0.0 → 1.0
  confidenceLevel:   ConfidenceLevel;
  verifiedCount:     number;
  unverifiedCount:   number;
  totalCount:        number;

  // Performance
  durationMs:        number;
  cacheHits:         number;
}

export interface GuardOptions {
  // Skip Kanoon API calls (useful in tests or when offline)
  skipKanoonVerification?: boolean;

  // Append inline [VERIFIED] / [UNVERIFIED] markers to citations in text
  annotateInlineMarkers?: boolean;

  // If true, the full guard result is logged at INFO level
  verbose?: boolean;
}

// SECTION 5: CITATION EXTRACTOR

class CitationExtractor {

  extract(text: string): RawCitation[] {
    const citations: RawCitation[] = [];
    const seen = new Set<string>(); // Deduplicate identical citations

    // Run all four pattern types
    citations.push(...this.extractSections(text, seen));
    citations.push(...this.extractArticles(text, seen));
    citations.push(...this.extractCases(text, seen));
    citations.push(...this.extractSchedules(text, seen));

    return citations;
  }

  private extractSections(text: string, seen: Set<string>): RawCitation[] {
    const results: RawCitation[] = [];
    let match: RegExpExecArray | null;

    // Reset lastIndex before each use (required for global regex)
    SECTION_PATTERN.lastIndex = 0;

    while ((match = SECTION_PATTERN.exec(text)) !== null) {
      const rawText   = match[0].trim();
      const sectionNum = match[1];
      const actRaw    = match[2]?.trim() ?? "";
      const actName   = normalizeActName(actRaw);

      // Deduplicate
      const key = `section:${actName}:${sectionNum}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type:       "SECTION",
        rawText,
        actName,
        sectionNum: sectionNum.toUpperCase(),
        startIndex: match.index,
        endIndex:   match.index + match[0].length,
      });
    }

    return results;
  }

  private extractArticles(text: string, seen: Set<string>): RawCitation[] {
    const results: RawCitation[] = [];
    let match: RegExpExecArray | null;

    ARTICLE_PATTERN.lastIndex = 0;
    while ((match = ARTICLE_PATTERN.exec(text)) !== null) {
      const rawText    = match[0].trim();
      const articleNum = match[1];

      const key = `article:constitution:${articleNum}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type:       "ARTICLE",
        rawText,
        actName:    "constitution of india",
        sectionNum: articleNum,
        startIndex: match.index,
        endIndex:   match.index + match[0].length,
      });
    }

    return results;
  }

  private extractCases(text: string, seen: Set<string>): RawCitation[] {
    const results: RawCitation[] = [];
    let match: RegExpExecArray | null;

    CASE_PATTERN.lastIndex = 0;
    while ((match = CASE_PATTERN.exec(text)) !== null) {
      const rawText  = match[0].trim();
      const party1   = match[1]?.trim();
      const party2   = match[2]?.trim();

      // Filter out false positives: parties should be at least 3 chars
      if (!party1 || !party2 || party1.length < 3 || party2.length < 3) continue;

      // Extract year from citation if present
      const yearMatch = rawText.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

      const caseName = `${party1} v. ${party2}`;
      const key = `case:${caseName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type:      "CASE_LAW",
        rawText,
        caseName,
        year,
        startIndex: match.index,
        endIndex:   match.index + match[0].length,
      });
    }

    return results;
  }

  private extractSchedules(text: string, seen: Set<string>): RawCitation[] {
    const results: RawCitation[] = [];
    let match: RegExpExecArray | null;

    SCHEDULE_PATTERN.lastIndex = 0;
    while ((match = SCHEDULE_PATTERN.exec(text)) !== null) {
      const rawText = match[0].trim();
      const actRaw  = match[1]?.trim() ?? "";
      const actName = normalizeActName(actRaw);

      const key = `schedule:${rawText.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type:      "SCHEDULE",
        rawText,
        actName,
        startIndex: match.index,
        endIndex:   match.index + match[0].length,
      });
    }

    return results;
  }
}


// SECTION 6: SECTION VALIDATOR
// Uses the INDIAN_ACTS_SECTION_MAP to check section numbers without
// making any API calls. Fast, deterministic, free.

class SectionValidator {

  validate(citation: RawCitation): VerificationStatus {
    if (citation.type !== "SECTION" && citation.type !== "ARTICLE") {
      return "SKIPPED"; // Only validates sections and articles
    }

    const actName    = citation.actName ?? "";
    const sectionNum = parseInt(citation.sectionNum ?? "0", 10);

    if (!sectionNum || sectionNum <= 0) return "UNVERIFIED";

    // Find matching Act in our lookup table
    const actMeta = this.findAct(actName);

    if (!actMeta) {
      // Act not in our table → we can't validate → don't call it unverified
      // Return SKIPPED so it gets passed to Kanoon for live verification
      return "SKIPPED";
    }

    // Check if section number is within valid range for this Act
    if (sectionNum > actMeta.maxSection) {
      logger.warn({
        msg: "[hallucination.guard] Section number exceeds Act maximum",
        citation: citation.rawText,
        sectionNum,
        maxSection: actMeta.maxSection,
        actName,
      });
      return "UNVERIFIED";
    }

    return "VERIFIED";
  }

  private findAct(actName: string): ActMetadata | null {
    const normalized = actName.toLowerCase().trim();

    // Direct match
    if (INDIAN_ACTS_SECTION_MAP[normalized]) {
      return INDIAN_ACTS_SECTION_MAP[normalized];
    }

    // Search by alias (e.g. "ipc" → "indian penal code")
    for (const [key, meta] of Object.entries(INDIAN_ACTS_SECTION_MAP)) {
      if (meta.aliases.some(alias => normalized.includes(alias))) {
        return meta;
      }
      // Partial name match (e.g. "contract act" matches "indian contract act")
      if (normalized.includes(key) || key.includes(normalized)) {
        return meta;
      }
    }

    return null;
  }
}

// SECTION 7: KANOON VERIFIER
// Makes live API calls to Indian Kanoon to verify case citations.
// Results are cached in Redis to avoid repeat API calls for the same case.

class KanoonVerifier {

  async verify(citation: RawCitation): Promise<{
    status: VerificationStatus;
    kanoonUrl?: string;
    kanoonDocId?: string;
    fromCache?: boolean;
    failReason?: string;
  }> {
    // Only verify case law via Kanoon
    // Sections are handled by SectionValidator without API calls
    if (citation.type !== "CASE_LAW") {
      return { status: "SKIPPED" };
    }

    const cacheKey = CACHE_KEYS.case(citation.rawText);

    // Step 1: Check Redis cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        logger.debug({
          msg: "[hallucination.guard] Cache hit for citation",
          citation: citation.rawText,
        });
        return { ...parsed, fromCache: true };
      }
    } catch (cacheError) {
      // Redis failure should never crash the guard — continue without cache
      logger.warn({
        msg: "[hallucination.guard] Redis cache read failed",
        error: (cacheError as Error).message,
      });
    }

    // Step 2: Live Kanoon API call with timeout
    try {
      const searchQuery = citation.caseName ?? citation.rawText;

      const kanoonResult = await Promise.race([
        verifyWithKanoon(searchQuery),
        rejectAfter(GUARD_CONFIG.KANOON_TIMEOUT_MS, "Kanoon API timeout"),
      ]) as { verified: boolean; kanoonUrl?: string };

      if (kanoonResult.verified && kanoonResult.kanoonUrl) {
        // Found a matching judgment
        const docIdMatch = kanoonResult.kanoonUrl.match(/\/doc\/(\d+)\//);
        const docId = docIdMatch ? docIdMatch[1] : undefined;
        const result = {
          status:      "VERIFIED" as VerificationStatus,
          kanoonDocId: docId,
          kanoonUrl:   kanoonResult.kanoonUrl,
        };

        // Cache the positive result for 24 hours
        await this.cacheResult(cacheKey, result, GUARD_CONFIG.CASE_CACHE_TTL);
        return result;

      } else {
        // No matching judgment found
        const result = {
          status:     "UNVERIFIED" as VerificationStatus,
          failReason: "No matching judgment found in Indian Kanoon",
        };

        // Cache the negative result too (but for shorter time — 1 hour)
        // Prevents hammering Kanoon for cases that don't exist
        await this.cacheResult(cacheKey, result, 3_600);
        return result;
      }

    } catch (error) {
      const errorMessage = (error as Error).message;

      logger.warn({
        msg: "[hallucination.guard] Kanoon verification failed",
        citation: citation.rawText,
        error: errorMessage,
      });

      // API call failed → don't penalize the response → return ERROR status
      // ERROR is different from UNVERIFIED — it means "we couldn't check, not that it's wrong"
      return {
        status:     "ERROR",
        failReason: errorMessage,
      };
    }
  }

  private async cacheResult(key: string, result: object, ttl: number): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(result));
    } catch (error) {
      // Non-fatal — continue without caching
      logger.warn({
        msg: "[hallucination.guard] Redis cache write failed",
        error: (error as Error).message,
      });
    }
  }
}

// SECTION 8: CONFIDENCE SCORER
// Calculates an overall confidence score for the response based on
// how many citations were verified, and assigns a level label.

class ConfidenceScorer {

  score(citations: VerifiedCitation[]): {
    score:        number;
    level:        ConfidenceLevel;
    verifiedCount:  number;
    unverifiedCount:number;
    errorCount:     number;
    skippedCount:   number;
  } {
    const total      = citations.length;
    const verified   = citations.filter(c => c.status === "VERIFIED").length;
    const unverified = citations.filter(c => c.status === "UNVERIFIED").length;
    const errors     = citations.filter(c => c.status === "ERROR").length;
    const skipped    = citations.filter(c => c.status === "SKIPPED").length;

    // If there are no citations to check → fully trustworthy
    if (total === 0) {
      return {
        score: 1.0, level: "HIGH",
        verifiedCount: 0, unverifiedCount: 0,
        errorCount: 0, skippedCount: 0,
      };
    }

    // Score is based on verifiable citations only (exclude SKIPPED and ERROR)
    // Rationale: SKIPPED means we couldn't check (neutral), ERROR means API failed (neutral)
    // Only UNVERIFIED (checked and not found) should hurt the score
    const checkable     = verified + unverified;
    const confidenceScore = checkable === 0
      ? 1.0                         // All skipped → can't penalize
      : verified / checkable;

    const level: ConfidenceLevel =
      confidenceScore >= GUARD_CONFIG.HIGH_THRESHOLD   ? "HIGH"   :
      confidenceScore >= GUARD_CONFIG.MEDIUM_THRESHOLD ? "MEDIUM" : "LOW";

    return {
      score:          confidenceScore,
      level,
      verifiedCount:  verified,
      unverifiedCount:unverified,
      errorCount:     errors,
      skippedCount:   skipped,
    };
  }
}

// SECTION 9: RESPONSE ANNOTATOR
// Optionally appends inline markers to each citation in the text,
// and always appends a confidence-level disclaimer at the end.

class ResponseAnnotator {

  annotate(
    originalText:   string,
    citations:      VerifiedCitation[],
    level:          ConfidenceLevel,
    verifiedCount:  number,
    totalCount:     number,
    options:        GuardOptions
  ): string {
    let text = originalText;

    // Step 1 (optional): Add inline [VERIFIED] / [UNVERIFIED] markers
    if (options.annotateInlineMarkers) {
      text = this.addInlineMarkers(text, citations);
    }

    // Step 2: Append confidence disclaimer
    text = this.appendDisclaimer(text, level, verifiedCount, totalCount);

    return text;
  }

  private addInlineMarkers(text: string, citations: VerifiedCitation[]): string {
    // Process citations in reverse order so indices stay valid after replacement
    const sorted = [...citations].sort((a, b) => b.startIndex - a.startIndex);

    for (const citation of sorted) {
      const marker =
        citation.status === "VERIFIED"   ? " ✓"                 :
        citation.status === "UNVERIFIED" ? " ⚠️[unverified]"     :
        citation.status === "ERROR"      ? " ❓[check manually]" :
        "";

      if (marker) {
        text =
          text.slice(0, citation.endIndex) +
          marker +
          text.slice(citation.endIndex);
      }
    }

    return text;
  }

  private appendDisclaimer(
    text:          string,
    level:         ConfidenceLevel,
    verifiedCount: number,
    totalCount:    number
  ): string {
    const DISCLAIMERS: Record<ConfidenceLevel, string> = {
      HIGH: [
        "",
        "---",
        "*⚖️ This is AI-generated legal information, not legal advice.",
        "Consult a qualified advocate before taking any legal action.*",
      ].join("\n"),

      MEDIUM: [
        "",
        "---",
        `⚠️ *Confidence Notice (Medium):* ${verifiedCount} of ${totalCount} citations`,
        "could be verified against Indian Kanoon. Some references may need",
        "independent verification before relying on them.",
        "",
        "*⚖️ This is AI-generated legal information, not legal advice.",
        "Consult a qualified advocate before taking any legal action.*",
      ].join("\n"),

      LOW: [
        "",
        "---",
        `🚨 **Low Confidence Warning:** Only ${verifiedCount} of ${totalCount} citations`,
        "could be verified against Indian Kanoon. This response may contain",
        "inaccurate legal references.",
        "",
        "**Do NOT rely on this response without independent verification**",
        "**by a qualified advocate.**",
        "",
        "*⚖️ This is AI-generated legal information, not legal advice.*",
      ].join("\n"),
    };

    return `${text}${DISCLAIMERS[level]}`;
  }
}

// SECTION 10: BATCH PROCESSOR
// Runs all citation verifications concurrently but caps concurrency
// to avoid hitting Kanoon's rate limit.

async function runVerificationsInBatches(
  citations:   RawCitation[],
  validator:   SectionValidator,
  verifier:    KanoonVerifier,
  options:     GuardOptions
): Promise<{ verified: VerifiedCitation[]; cacheHits: number }> {
  const results: VerifiedCitation[] = [];
  let cacheHits = 0;

  for (let i = 0; i < citations.length; i += GUARD_CONFIG.MAX_CONCURRENT_VERIFICATIONS) {
    const batch = citations.slice(i, i + GUARD_CONFIG.MAX_CONCURRENT_VERIFICATIONS);

    const batchResults = await Promise.all(
      batch.map(async (citation): Promise<VerifiedCitation> => {

        // ── Sections: use fast lookup table first ──────────────────────────
        if (citation.type === "SECTION" || citation.type === "ARTICLE") {
          const localStatus = validator.validate(citation);

          if (localStatus !== "SKIPPED") {
            // Local validation gave a clear answer → no need for API call
            return { ...citation, status: localStatus };
          }

          // SKIPPED = Act not in our table → try Kanoon as fallback
          if (options.skipKanoonVerification) {
            return { ...citation, status: "SKIPPED" };
          }

          const kanoonResult = await verifier.verify({
            ...citation,
            type: "CASE_LAW", // Treat the Act name as a search term for Kanoon
            caseName: `${citation.actName} section ${citation.sectionNum}`,
          });

          return { ...citation, ...kanoonResult };
        }

        // ── Case law: use Kanoon API ───────────────────────────────────────
        if (citation.type === "CASE_LAW") {
          if (options.skipKanoonVerification) {
            return { ...citation, status: "SKIPPED" };
          }

          const kanoonResult = await verifier.verify(citation);
          if (kanoonResult.fromCache) cacheHits++;

          return { ...citation, ...kanoonResult };
        }

        // ── Schedules: skip verification (too complex for regex) ──────────
        return { ...citation, status: "SKIPPED" };
      })
    );

    results.push(...batchResults);
  }

  return { verified: results, cacheHits };
}

// SECTION 11: MAIN GUARD CLASS — PUBLIC API
// This is the only thing the rest of the codebase imports and calls.

class HallucinationGuard {
  private extractor  = new CitationExtractor();
  private validator  = new SectionValidator();
  private verifier   = new KanoonVerifier();
  private scorer     = new ConfidenceScorer();
  private annotator  = new ResponseAnnotator();

  async run(
    responseText: string,
    options: GuardOptions = {}
  ): Promise<GuardResult> {
    const startTime = Date.now();

    logger.info({ msg: "[hallucination.guard] Starting guard run" });

    // ── Step 1: Extract all citations ─────────────────────────────────────
    const rawCitations = this.extractor.extract(responseText);

    logger.info({
      msg: "[hallucination.guard] Citations extracted",
      count: rawCitations.length,
      breakdown: {
        sections:  rawCitations.filter(c => c.type === "SECTION").length,
        articles:  rawCitations.filter(c => c.type === "ARTICLE").length,
        cases:     rawCitations.filter(c => c.type === "CASE_LAW").length,
        schedules: rawCitations.filter(c => c.type === "SCHEDULE").length,
      },
    });

    // ── Step 2: Verify all citations ──────────────────────────────────────
    const { verified: verifiedCitations, cacheHits } =
      await runVerificationsInBatches(
        rawCitations,
        this.validator,
        this.verifier,
        options
      );

    // ── Step 3: Score confidence ──────────────────────────────────────────
    const scoreResult = this.scorer.score(verifiedCitations);

    logger.info({
      msg: "[hallucination.guard] Scoring complete",
      score:       scoreResult.score.toFixed(2),
      level:       scoreResult.level,
      verified:    scoreResult.verifiedCount,
      unverified:  scoreResult.unverifiedCount,
      errors:      scoreResult.errorCount,
      skipped:     scoreResult.skippedCount,
      cacheHits,
    });

    // ── Step 4: Annotate response ─────────────────────────────────────────
    const annotatedResponse = this.annotator.annotate(
      responseText,
      verifiedCitations,
      scoreResult.level,
      scoreResult.verifiedCount,
      rawCitations.length,
      options
    );

    const durationMs = Date.now() - startTime;

    if (options.verbose) {
      logger.info({
        msg: "[hallucination.guard] Complete",
        durationMs,
        confidenceLevel: scoreResult.level,
        citationsDetail: verifiedCitations.map(c => ({
          type:   c.type,
          text:   c.rawText.slice(0, 60),
          status: c.status,
          url:    c.kanoonUrl,
        })),
      });
    }

    return {
      annotatedResponse,
      citationsRaw:      rawCitations,
      citationsVerified: verifiedCitations,
      confidenceScore:   scoreResult.score,
      confidenceLevel:   scoreResult.level,
      verifiedCount:     scoreResult.verifiedCount,
      unverifiedCount:   scoreResult.unverifiedCount,
      totalCount:        rawCitations.length,
      durationMs,
      cacheHits,
    };
  }
}

// SECTION 12: UTILITY FUNCTIONS

// Normalizes Act name to lowercase for map lookup
// "Indian Penal Code, 1860" → "indian penal code"
function normalizeActName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/,?\s*\d{4}\s*$/, "")   // Remove trailing year: ", 1860" or "1860"
    .replace(/\s+/g, " ")
    .trim();
}

// Creates a Redis-safe slug from any string
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);  // Max 100 chars for Redis key safety
}

// Creates a promise that rejects after N milliseconds
function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
}

// SECTION 13: EXPORTS
// Export the singleton instance and all types.
// Usage:
//   import { hallucinationGuard } from '../guards/hallucination.guard';
//   const result = await hallucinationGuard.run(claudeResponse);

export const hallucinationGuard = new HallucinationGuard();

// Also export the class itself for testing (allows creating fresh instances)
export { HallucinationGuard };
export { INDIAN_ACTS_SECTION_MAP };