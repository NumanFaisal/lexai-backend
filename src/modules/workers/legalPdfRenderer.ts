// src/workers/legalPdfRenderer.ts
import pdfmake from 'pdfmake';
import { TDocumentDefinitions, TFontDictionary, Content, TableCell } from 'pdfmake/interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// PRO-LEVEL DESIGN METRICS (1 cm = 28.346 points)
// ─────────────────────────────────────────────────────────────────────────────
const CM = 28.346;
const MARGIN_LEFT = 3.5 * CM; // Standard 1.37" left margin for legal/court binding
const MARGIN_RIGHT = 2.5 * CM;
const MARGIN_TOP = 2.5 * CM;
const MARGIN_BOTTOM = 2.5 * CM;

// Global document category routing matrix
const SECTOR_MAPPING = {
    CLASS_A_COURT: new Set(["BAIL_APPLICATION", "WRITTEN_STATEMENT", "CONSUMER_COMPLAINT", "VAKALATNAMA", "PETITION", "SUIT", "APPEAL"]),
    CLASS_C_NOTICES: new Set(["LEGAL_NOTICE", "AFFIDAVIT", "POWER_OF_ATTORNEY", "DEMAND_NOTICE"])
};

const fonts: TFontDictionary = {
    Times: {
        normal: 'Times-Roman',
        bold: 'Times-Bold',
        italics: 'Times-Italic',
        bolditalics: 'Times-BoldItalic'
    }
};

pdfmake.setFonts(fonts);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => true);

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED ADAPTIVE CLASSIFIERS (Lawyer Logic)
// ─────────────────────────────────────────────────────────────────────────────
function cleanText(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, '') // Strip markdown artifacts
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/^---+$|^===+$/gm, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`/g, '')
        .replace(/[^\x00-\x7F]+/g, '') // Remove un-renderable emojis
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Bracing pattern classifiers for highly volatile AI text expressions
const isCourtHeader = (l: string, i: number): boolean => i < 8 && (/IN THE COURT OF/i.test(l) || /BEFORE THE DISTRICT/i.test(l) || /HON'BLE COURT/i.test(l));
const isCaseNumber = (l: string): boolean => /^(FILING|CASE|A\.B\.P\.|W\.P\.|CRL\.|C\.R\.P\.|ABP|WP|COMPLAINT|SUIT|NO\s*:)/i.test(l);
const isVersus = (l: string): boolean => /^(VERSUS|VS\.|VS|V\.)/i.test(l);
const isSubjectLine = (l: string): boolean => /^(SUB|SUBJECT|IN THE MATTER OF)\s*:-/i.test(l) || l.toUpperCase().startsWith("SUBJECT:");
const isIndexStart = (l: string): boolean => /^(INDEX)$/i.test(l);
const isNumberedPara = (l: string): boolean => /^(\d+)\.\s+/.test(l);
const isDisclaimer = (l: string): boolean => l.toLowerCase().includes("ai-generated") || (l.toLowerCase().includes("lexai") && (l.toLowerCase().includes("draft") || l.toLowerCase().includes("generated")));

// Flexible Contract Classifiers (Class B)
const isDocTitle = (l: string, i: number): boolean => i < 5 && l.length > 5 && l === l.toUpperCase() && /(AGREEMENT|DEED|CONTRACT|NDA|LEASE|SETTLEMENT)/i.test(l);
const isBetweenLabel = (l: string): boolean => /^(THIS AGREEMENT|THIS DEED|BY AND BETWEEN|BETWEEN\s*:)/i.test(l);
const isRecitalHeader = (l: string): boolean => /^(RECITALS|WITNESSETH|BACKGROUND)/i.test(l);
const isRecitalLine = (l: string): boolean => /^(WHEREAS|WHEREAS,)/i.test(l);
const isClauseHeading = (l: string): boolean => /^([A-Z0-9\s._-]+)$/.test(l) && l.length < 60 && /(ARTICLE|CLAUSE|SECTION|\b[0-9]+\.\s+[A-Z])/i.test(l);
const isSubClause = (l: string): boolean => /^(\s*|\t*)([0-9]+\.[0-9]+|\([a-z0-9]\)|[a-z]\.)\s+/i.test(l);
const isWitnessHeader = (l: string): boolean => /^(WITNESSES|WITNESS|IN WITNESS WHEREOF)/i.test(l);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT BUILDERS (Clean Layout Blocks)
// ─────────────────────────────────────────────────────────────────────────────
function buildIndexTable(lines: string[]): Content {
    const rows: TableCell[][] = [[
        { text: 'S.No.', style: 'tableHeader' },
        { text: 'Particulars / Documents', style: 'tableHeader' },
        { text: 'Page No.', style: 'tableHeader' }
    ]];

    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/\s{2,}/);
        if (parts.length >= 2) {
            rows.push([
                { text: parts[0], alignment: 'center' },
                { text: parts[1] },
                { text: parts[2] || '—', alignment: 'center' }
            ]);
        } else {
            rows.push([{ text: line, colSpan: 3 }, {}, {}]);
        }
    }

    return {
        table: { headerRows: 1, widths: [1.5 * CM, 11 * CM, 2.5 * CM], body: rows },
        layout: { hLineColor: () => '#999999', vLineColor: () => '#999999', hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 8, 0, 16]
    };
}

function buildExecutionBlock(signatures: string[]): Content {
    const cells: TableCell[] = signatures.map(sig => ({
        stack: [
            { text: sig, style: 'bodyBold', margin: [0, 12, 0, 16] },
            { text: 'Signature: ___________________________', style: 'body', margin: [0, 0, 0, 6] },
            { text: 'Name:      ___________________________', style: 'body', margin: [0, 0, 0, 6] },
            { text: 'Title:     ___________________________', style: 'body', margin: [0, 0, 0, 6] },
            { text: 'Date:      ___________________________', style: 'body', margin: [0, 0, 0, 0] }
        ]
    }));

    const usableWidth = 595.27 - MARGIN_LEFT - MARGIN_RIGHT;
    return {
        table: {
            widths: cells.length === 2 ? [usableWidth * 0.5, usableWidth * 0.5] : [usableWidth],
            body: [cells]
        },
        layout: 'noBorders',
        margin: [0, 15, 0, 15]
    };
}

function buildPleadingPartyRow(name: string, role: string): Content {
    const totalWidth = 595.27 - MARGIN_LEFT - MARGIN_RIGHT;
    return {
        table: {
            widths: [totalWidth * 0.70, totalWidth * 0.30],
            body: [[
                { text: name, style: 'bodyBold', alignment: 'left' },
                { text: role, style: 'bodyBold', alignment: 'right' }
            ]]
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 4]
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL RENDERING ENGINE
// ─────────────────────────────────────────────────────────────────────────────
export class LegalDocumentRenderer {
    private docType: string;
    private outputPath: string;
    private layoutStrategy: 'COURT' | 'CONTRACT' | 'NOTICE';
    private story: Content[] = [];

    constructor(docType: string, outputPath: string) {
        this.docType = docType.toUpperCase().trim().replace(/\s+/g, '_');
        this.outputPath = outputPath;

        if (SECTOR_MAPPING.CLASS_A_COURT.has(this.docType)) {
            this.layoutStrategy = 'COURT';
        } else if (SECTOR_MAPPING.CLASS_C_NOTICES.has(this.docType)) {
            this.layoutStrategy = 'NOTICE';
        } else {
            this.layoutStrategy = 'CONTRACT'; // Safe institutional contract benchmark baseline
        }
    }

    public async render(rawContent: string): Promise<string> {
        const content = cleanText(rawContent);
        const lines = content.split('\n');

        switch (this.layoutStrategy) {
            case 'COURT': this.generateCourtLayout(lines); break;
            case 'NOTICE': this.generateNoticeLayout(lines); break;
            case 'CONTRACT': this.generateContractLayout(lines); break;
        }

        const docDefinition: TDocumentDefinitions = {
            content: this.story,
            pageSize: 'A4',
            pageMargins: [MARGIN_LEFT, MARGIN_TOP, MARGIN_RIGHT, MARGIN_BOTTOM],
            defaultStyle: { font: 'Times' },
            styles: {
                courtHeader: { font: 'Times', fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 6] },
                caseNumber: { font: 'Times', fontSize: 11, alignment: 'center', margin: [0, 0, 0, 8] },
                versus: { font: 'Times', fontSize: 12, bold: true, alignment: 'center', margin: [0, 8, 0, 8] },
                docTitle: { font: 'Times', fontSize: 14, bold: true, alignment: 'center', margin: [0, 10, 0, 15], lineHeight: 1.2 },
                clauseHeading: { font: 'Times', fontSize: 11, bold: true, alignment: 'left', margin: [0, 14, 0, 6] },
                body: { font: 'Times', fontSize: 11, alignment: 'justify', lineHeight: 1.5, margin: [0, 0, 0, 8] },
                bodyBold: { font: 'Times', fontSize: 11, bold: true, alignment: 'justify', lineHeight: 1.5, margin: [0, 0, 0, 8] },
                indentBlock: { font: 'Times', fontSize: 11, alignment: 'justify', lineHeight: 1.5, margin: [24, 0, 0, 8] },
                tableHeader: { font: 'Times', fontSize: 10, bold: true, alignment: 'center' },
                disclaimer: { font: 'Times', fontSize: 8.5, italics: true, alignment: 'center', color: '#666666', margin: [0, 30, 0, 0] }
            },
            footer: (currentPage) => ({
                stack: [
                    { canvas: [{ type: 'line', x1: MARGIN_LEFT, y1: 0, x2: 595.27 - MARGIN_RIGHT, y2: 0, lineWidth: 0.5, strokeColor: '#b0b0b0' }] },
                    { text: `Page ${currentPage}`, alignment: 'center', font: 'Times', fontSize: 9, margin: [0, 6, 0, 0], color: '#444444' }
                ],
                margin: [0, 0, 0, 20]
            })
        };

        const doc = pdfmake.createPdf(docDefinition);
        await doc.write(this.outputPath);
        return this.outputPath;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // COURT PRODUCTION MATRIX (CLASS A)
    // ─────────────────────────────────────────────────────────────────────────────
    private generateCourtLayout(lines: string[]) {
        let idx = 0; let inIndex = false; let indexLines: string[] = [];

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (isCourtHeader(stripped, idx)) { this.story.push({ text: stripped.toUpperCase(), style: 'courtHeader' }); idx++; continue; }
            if (isCaseNumber(stripped)) { this.story.push({ text: stripped, style: 'caseNumber' }); idx++; continue; }
            if (isVersus(stripped)) { this.story.push({ text: 'VERSUS', style: 'versus' }); idx++; continue; }
            if (/[.…·_-]+\s*(Petitioner|Plaintiff|Complainant|Accused|Opp\.? Party|Respondent)/i.test(line)) {
                const match = line.match(/(.+?)([\s.…·_-]+\b(Petitioner|Plaintiff|Complainant|Accused|Opp\.? Party|Respondent)\b)/i);
                if (match) this.story.push(buildPleadingPartyRow(match[1].trim(), match[2].replace(/[.…·_-]/g, '').trim()));
                else this.story.push({ text: stripped, style: 'bodyBold' });
                idx++; continue;
            }
            if (isIndexStart(stripped)) { inIndex = true; this.story.push({ text: 'INDEX', style: 'clauseHeading', alignment: 'center' }); idx++; continue; }
            if (inIndex) {
                if (/IN THE COURT|BEFORE THE/i.test(stripped)) {
                    if (indexLines.length) this.story.push(buildIndexTable(indexLines));
                    inIndex = false; this.story.push({ text: '', pageBreak: 'after' });
                    this.story.push({ text: stripped.toUpperCase(), style: 'courtHeader' });
                } else { indexLines.push(stripped); }
                idx++; continue;
            }
            if (/^(MOST RESPECTFULLY SHEWETH|HUMBLE PETITION)/i.test(stripped)) { this.story.push({ text: stripped + ':', style: 'bodyBold', margin: [0, 10, 0, 10] }); idx++; continue; }
            if (/^(:?\s*)AFFIDAVIT/i.test(stripped)) { this.story.push({ text: '', pageBreak: 'before' }, { text: 'AFFIDAVIT', style: 'courtHeader', margin: [0, 10, 0, 15] }); idx++; continue; }
            if (isDisclaimer(stripped)) { this.story.push({ text: stripped, style: 'disclaimer' }); idx++; continue; }

            this.story.push({ text: stripped, style: isNumberedPara(stripped) ? 'body' : 'body', margin: stripped.startsWith('That') ? [30, 0, 0, 8] : [0, 0, 0, 8] });
            idx++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TRANSACTIONAL CONTRACT LAW ARCHITECTURE (CLASS B)
    // ─────────────────────────────────────────────────────────────────────────────
    private generateContractLayout(lines: string[]) {
        let idx = 0; let inRecitals = false; let discoveredSignatures: string[] = [];

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (isDocTitle(stripped, idx)) { this.story.push({ text: stripped, style: 'docTitle' }); idx++; continue; }
            if (isBetweenLabel(stripped) || stripped.startsWith("NOW THIS AGREEMENT")) { this.story.push({ text: stripped, style: 'body' }); idx++; continue; }
            if (isRecitalHeader(stripped)) { inRecitals = true; this.story.push({ text: stripped.toUpperCase(), style: 'clauseHeading' }); idx++; continue; }
            if (inRecitals && isRecitalLine(stripped)) { this.story.push({ text: stripped, style: 'indentBlock' }); idx++; continue; }
            if (isClauseHeading(stripped)) { inRecitals = false; this.story.push({ text: stripped, style: 'clauseHeading' }); idx++; continue; }
            
            // Signature dynamic grouping sweep
            if (/^For and on behalf of/i.test(stripped) || (isWitnessHeader(stripped) && idx > lines.length - 30)) {
                if (/^For/i.test(stripped)) discoveredSignatures.push(stripped.replace(/^For and on behalf of\s*/i, ''));
                idx++;
                while (idx < lines.length) {
                    const trace = lines[idx].trim();
                    if (/^For/i.test(trace)) discoveredSignatures.push(trace.replace(/^For and on behalf of\s*/i, ''));
                    if (isDisclaimer(trace)) break;
                    idx++;
                }
                if (discoveredSignatures.length) this.story.push(buildExecutionBlock(discoveredSignatures));
                continue;
            }

            if (isDisclaimer(stripped)) { this.story.push({ text: stripped, style: 'disclaimer' }); idx++; continue; }
            
            this.story.push({ 
                text: stripped, 
                style: isSubClause(line) ? 'indentBlock' : 'body'
            });
            idx++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ADVOCATE NOTICE CORRESPONDENCE MATRIX (CLASS C)
    // ─────────────────────────────────────────────────────────────────────────────
    private generateNoticeLayout(lines: string[]) {
        let idx = 0; let contextAvis = false;

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (!contextAvis && !stripped.startsWith("To")) {
                this.story.push({ text: stripped, style: idx === 0 ? 'noticeSender' : 'noticeAddress' });
                idx++; continue;
            }
            if (/^(To|TO,)/.test(stripped)) {
                contextAvis = true;
                this.story.push({ text: 'To,', style: 'noticeAddress', margin: [0, 10, 0, 4] });
                idx++; continue;
            }
            if (isSubjectLine(stripped) || stripped.toUpperCase().startsWith("SUBJECT")) {
                this.story.push({ text: stripped, style: 'bodyBold', decoration: 'underline', margin: [0, 10, 0, 10] });
                idx++; continue;
            }
            if (/Sincerely|Faithfully|Regards/i.test(stripped)) {
                this.story.push({ text: stripped, style: 'body', margin: [0, 20, 0, 25] });
                idx++; continue;
            }
            if (isDisclaimer(stripped)) { this.story.push({ text: stripped, style: 'disclaimer' }); idx++; continue; }

            this.story.push({ text: stripped, style: 'body' });
            idx++;
        }
    }
}