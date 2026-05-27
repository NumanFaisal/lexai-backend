import { CitationType } from "@prisma/client";

export interface ExtractedCitation {
  type: CitationType;
  rawText: string;
  actName?: string;
  sectionNum?: string;
  caseName?: string;
}

export function extractCitations(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];

  // 1. Extract Sections (e.g., "Section 438 of the Criminal Procedure Code")
  const sectionRegex = /Section\s+(\d+[A-Z]?)\s+of\s+(?:the\s+)?([A-Za-z\s]+?(?:Act|Code|CrPC|IPC|BNS|BNSS))/gi;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(text)) !== null) {
    citations.push({
      type: "SECTION",
      rawText: sectionMatch[0].trim(),
      sectionNum: sectionMatch[1].trim(),
      actName: sectionMatch[2].trim(),
    });
  }

  // 2. Extract Case Laws (Allows full names with uppercase, lowercase, and dots)
  const caseRegex = /([A-Z][a-zA-Z\s\.\&]+?)\s+v\.?\s+([A-Z][a-zA-Z\s\.\&]+?)(?=\s*\(|\s*—|$)/g;
  let caseMatch;
  while ((caseMatch = caseRegex.exec(text)) !== null) {
    const plaintiff = caseMatch[1].trim();
    const defendant = caseMatch[2].trim();
    
    // Filter out false positives
    if (plaintiff.includes("Section") || defendant.includes("Section")) continue;
    
    citations.push({
      type: "CASE_LAW",
      rawText: `${plaintiff} v. ${defendant}`,
      caseName: `${plaintiff} v. ${defendant}`,
    });
  }

  // 3. Remove duplicates based on rawText
  const uniqueCitations = Array.from(new Set(citations.map(c => c.rawText)))
    .map(text => citations.find(c => c.rawText === text) as ExtractedCitation);

  return uniqueCitations;
}