export interface  ExtractedCitation {
  type: 'SECTION' | 'CASE_LAW';
  rawText: string;
  actName?: string;
  sectionNum?: string;
  caseName?: string;
}

export const extractCitations = (text: string): ExtractedCitation[] => {
  const citations: ExtractedCitation[] = [];

  // 1. Regex to match Sections of Acts
  // Example matches: "Section 138 of the Negotiable Instruments Act", "Sec 302 of IPC", "Section 439 of CrPC"
  const sectionRegex = /(?:Section|Sec\.?)\s+(\d+[A-Z]?)\s+of\s+(?:the\s+)?([A-Za-z\s]+?(?:Act|Code|IPC|CrPC))/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(text)) !== null) {
    citations.push({
      type: 'SECTION',
      rawText: sectionMatch[0].trim(),
      sectionNum: sectionMatch[1],
      actName: sectionMatch[2].trim(),
    })
  }

  // 2. Regex to match Case Laws
  // Example matches: "Kesavananda Bharati v. State of Kerala", "State of Maharashtra vs. XYZ"
  const caseRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:v\.|vs\.|versus)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  let caseMatch;

  while ((caseMatch = caseRegex.exec(text)) !== null) {
    citations.push({
      type: 'CASE_LAW',
      rawText: caseMatch[0].trim(),
      caseName: caseMatch[0].trim(),
    });
  }

  // Optional: Remove exact duplicates if Claude cites the same section multiple times
  const uniqueCitations = Array.from(new Map(citations.map(c => [c.rawText, c])).values());

  return uniqueCitations;
}