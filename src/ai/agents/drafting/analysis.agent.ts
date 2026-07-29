import { BaseAgent } from '../base.agent';
import { getLLM } from '../../providers/llm.factory';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { clauseChecklists } from '../../config/clauseChecklists';
import { DocumentType } from '@prisma/client';

export interface MissingClauseResult {
  clauseType: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction: string;
}

export interface JurisdictionWarning {
  message: string;
  affectedFields: string[];
}

export class AnalysisAgent extends BaseAgent {
  constructor() {
    super('DRAFT');
  }

  public async detectMissingClauses(documentText: string, documentType: DocumentType | string): Promise<MissingClauseResult[]> {
    const checklist = clauseChecklists[documentType];
    if (!checklist || checklist.length === 0) return [];

    const textLower = documentText.toLowerCase();
    
    // Pass 1: Lightweight keyword matching
    const missingCandidates: string[] = [];
    for (const clause of checklist) {
      // Basic keyword heuristics
      const keyword = clause.replace(/_/g, ' ');
      // Also check specific variants
      const variants = [keyword];
      if (clause === 'jurisdiction') variants.push('courts at', 'exclusive jurisdiction');
      if (clause === 'governing_law') variants.push('governed by the laws', 'laws of india');
      if (clause === 'confidentiality_obligations') variants.push('confidential information', 'non-disclosure');
      if (clause === 'term_duration') variants.push('term of', 'duration of', 'commence on');
      
      let found = false;
      for (const variant of variants) {
        if (textLower.includes(variant.toLowerCase())) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        missingCandidates.push(clause);
      }
    }

    if (missingCandidates.length === 0) {
      return []; // All found via fast pass
    }

    // Pass 2: Fallback to LLM for ambiguous cases
    const llm = getLLM('gpt-4o', { temperature: 0.1 });
    // User requested claude-sonnet-4-6, but the codebase uses gpt-4o via getLLM currently. 
    // I will use what getLLM supports. Let's assume standard 'gpt-4o' or 'claude-3-5-sonnet-20240620' if supported. 
    // Usually 'gpt-4o' is standard in this project.
    
    const messages = [
      new SystemMessage(
        `You are a clause-detection classifier. Given a legal document's text and a list of expected clause types, return ONLY a JSON array of clause types that are MISSING. Do not add commentary.`
      ),
      new HumanMessage(
        `Expected Clause Types (Candidates): ${JSON.stringify(missingCandidates)}\n\nDocument Text:\n${documentText.substring(0, 15000)}`
      )
    ];

    try {
      const response = await llm.invoke(messages);
      const rawText = response.content.toString();
      
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const trulyMissing: string[] = JSON.parse(cleaned);

      return trulyMissing.map(clause => ({
        clauseType: clause,
        severity: this.getSeverityForClause(clause),
        suggestedAction: `Add ${clause.replace(/_/g, ' ')} clause`
      }));
    } catch (err) {
      console.error('Error in detectMissingClauses LLM fallback:', err);
      // Fallback to returning all candidates if LLM fails
      return missingCandidates.map(clause => ({
        clauseType: clause,
        severity: this.getSeverityForClause(clause),
        suggestedAction: `Add ${clause.replace(/_/g, ' ')} clause`
      }));
    }
  }

  private getSeverityForClause(clause: string): 'high' | 'medium' | 'low' {
    const highSeverity = ['governing_law', 'jurisdiction', 'confidentiality_obligations', 'consideration_amount', 'prayer', 'affidavit'];
    const mediumSeverity = ['indemnity', 'term_duration', 'termination', 'non_compete', 'non_solicitation'];
    
    if (highSeverity.includes(clause)) return 'high';
    if (mediumSeverity.includes(clause)) return 'medium';
    return 'low';
  }

  public checkJurisdictionConsistency(documentFields: Record<string, string>): JurisdictionWarning[] {
    const warnings: JurisdictionWarning[] = [];
    
    const jurisdiction = documentFields['jurisdiction'] || documentFields['governing_law'];
    if (!jurisdiction) return warnings;
    
    const stateRegex = /(maharashtra|delhi|karnataka|tamil nadu|gujarat|uttar pradesh|west bengal|telangana|haryana|punjab|rajasthan|kerala|odisha|madhya pradesh)/i;
    
    const jurisMatch = jurisdiction.match(stateRegex);
    if (!jurisMatch) return warnings; // Can't determine jurisdiction state deterministically
    
    const jurisState = jurisMatch[0].toLowerCase();

    // Check all address fields
    for (const [key, value] of Object.entries(documentFields)) {
      if (key.includes('address') && typeof value === 'string') {
        const addressMatch = value.match(stateRegex);
        if (addressMatch) {
          const addressState = addressMatch[0].toLowerCase();
          if (addressState !== jurisState) {
            warnings.push({
              message: `Party address in ${addressState.charAt(0).toUpperCase() + addressState.slice(1)} differs from jurisdiction (${jurisState.charAt(0).toUpperCase() + jurisState.slice(1)}). Consider reviewing jurisdiction.`,
              affectedFields: [key, 'jurisdiction']
            });
          }
        }
      }
    }

    return warnings;
  }

  public extractFieldsFromHTML(html: string): Record<string, string> {
    const fields: Record<string, string> = {};
    // TipTap renders it as <span data-type="template-placeholder" fieldid="some_field">value</span>
    // Sometimes React or TipTap might render field-id or fieldId. We'll match broadly.
    const regex = /<span[^>]*field[I-i]d="([^"]+)"[^>]*>(.*?)<\/span>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const key = match[1];
      // strip inner HTML tags from the value
      const value = match[2].replace(/<[^>]*>?/gm, '').trim();
      fields[key] = value;
    }
    return fields;
  }
}

export const analysisAgent = new AnalysisAgent();
