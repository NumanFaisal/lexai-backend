// src/workers/legalPdfRenderer.ts
import PDFDocument from 'pdfkit';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// PRO-LEVEL DESIGN METRICS (1 cm = 28.346 points)
// ─────────────────────────────────────────────────────────────────────────────
const CM = 28.346;
const MARGIN_LEFT = 3.5 * CM;   // Standard 1.37" left margin for legal/court binding
const MARGIN_RIGHT = 2.5 * CM;
const MARGIN_TOP = 2.5 * CM;
const MARGIN_BOTTOM = 2.5 * CM;

const PAGE_WIDTH = 595.27; // A4
const USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const FONT_NORMAL = 'Times-Roman';
const FONT_BOLD = 'Times-Bold';
const FONT_ITALIC = 'Times-Italic';

const STYLES = {
    courtHeader:   { font: FONT_BOLD,   size: 13, align: 'center' as const, marginBottom: 6 },
    caseNumber:    { font: FONT_NORMAL, size: 11, align: 'center' as const, marginBottom: 8 },
    versus:        { font: FONT_BOLD,   size: 12, align: 'center' as const, marginBottom: 8, marginTop: 8 },
    docTitle:      { font: FONT_BOLD,   size: 14, align: 'center' as const, marginBottom: 15, marginTop: 10 },
    clauseHeading: { font: FONT_BOLD,   size: 11, align: 'left'   as const, marginBottom: 6,  marginTop: 14 },
    body:          { font: FONT_NORMAL, size: 11, align: 'justify' as const, marginBottom: 8,  lineGap: 5.5 },
    bodyBold:      { font: FONT_BOLD,   size: 11, align: 'justify' as const, marginBottom: 8,  lineGap: 5.5 },
    indentBlock:   { font: FONT_NORMAL, size: 11, align: 'justify' as const, marginBottom: 8,  lineGap: 5.5, indent: 24 },
    tableHeader:   { font: FONT_BOLD,   size: 10, align: 'center' as const },
    disclaimer:    { font: FONT_ITALIC, size: 8.5, align: 'center' as const, marginTop: 30, color: '#666666' },
    noticeAddress: { font: FONT_NORMAL, size: 11, align: 'left'   as const, marginBottom: 4 },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR MAPPING
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_MAPPING = {
    CLASS_A_COURT:    new Set(["BAIL_APPLICATION", "WRITTEN_STATEMENT", "CONSUMER_COMPLAINT", "VAKALATNAMA", "PETITION", "SUIT", "APPEAL"]),
    CLASS_C_NOTICES:  new Set(["LEGAL_NOTICE", "AFFIDAVIT", "POWER_OF_ATTORNEY", "DEMAND_NOTICE"])
};

// ─────────────────────────────────────────────────────────────────────────────
// TEXT CLEANUP
// ─────────────────────────────────────────────────────────────────────────────
function cleanText(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/^---+$|^===+$/gm, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`/g, '')
        .replace(/[^\x00-\x7F]+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE CLASSIFIERS
// ─────────────────────────────────────────────────────────────────────────────
const isCourtHeader   = (l: string, i: number): boolean => i < 8 && (/IN THE COURT OF/i.test(l) || /BEFORE THE DISTRICT/i.test(l) || /HON'BLE COURT/i.test(l));
const isCaseNumber    = (l: string): boolean => /^(FILING|CASE|A\.B\.P\.|W\.P\.|CRL\.|C\.R\.P\.|ABP|WP|COMPLAINT|SUIT|NO\s*:)/i.test(l);
const isVersus        = (l: string): boolean => /^(VERSUS|VS\.|VS|V\.)/i.test(l);
const isSubjectLine   = (l: string): boolean => /^(SUB|SUBJECT|IN THE MATTER OF)\s*:-/i.test(l) || l.toUpperCase().startsWith("SUBJECT:");
const isIndexStart    = (l: string): boolean => /^(INDEX)$/i.test(l);
const isNumberedPara  = (l: string): boolean => /^(\d+)\.\s+/.test(l);
const isDisclaimer    = (l: string): boolean => l.toLowerCase().includes("ai-generated") || (l.toLowerCase().includes("lexai") && (l.toLowerCase().includes("draft") || l.toLowerCase().includes("generated")));
const isDocTitle      = (l: string, i: number): boolean => i < 5 && l.length > 5 && l === l.toUpperCase() && /(AGREEMENT|DEED|CONTRACT|NDA|LEASE|SETTLEMENT)/i.test(l);
const isBetweenLabel  = (l: string): boolean => /^(THIS AGREEMENT|THIS DEED|BY AND BETWEEN|BETWEEN\s*:)/i.test(l);
const isRecitalHeader = (l: string): boolean => /^(RECITALS|WITNESSETH|BACKGROUND)/i.test(l);
const isRecitalLine   = (l: string): boolean => /^(WHEREAS|WHEREAS,)/i.test(l);
const isClauseHeading = (l: string): boolean => /^([A-Z0-9\s._-]+)$/.test(l) && l.length < 60 && /(ARTICLE|CLAUSE|SECTION|\b[0-9]+\.\s+[A-Z])/i.test(l);
const isSubClause     = (l: string): boolean => /^(\s*|\t*)([0-9]+\.[0-9]+|\([a-z0-9]\)|[a-z]\.)?\s+/i.test(l);
const isWitnessHeader = (l: string): boolean => /^(WITNESSES|WITNESS|IN WITNESS WHEREOF)/i.test(l);

// ─────────────────────────────────────────────────────────────────────────────
// PDF RENDERING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
interface StyleDef {
    font: string;
    size: number;
    align: 'left' | 'center' | 'right' | 'justify';
    marginBottom?: number;
    marginTop?: number;
    lineGap?: number;
    indent?: number;
    color?: string;
}

function applyStyle(doc: PDFKit.PDFDocument, style: StyleDef): void {
    doc.font(style.font).fontSize(style.size).fillColor(style.color ?? '#000000');
    if (style.marginTop) doc.moveDown(style.marginTop / 12);
}

function addText(
    doc: PDFKit.PDFDocument,
    text: string,
    style: StyleDef,
    extraOpts: object = {}
): void {
    applyStyle(doc, style);
    const opts: PDFKit.Mixins.TextOptions = {
        align: style.align,
        lineGap: style.lineGap ?? 3,
        indent: style.indent ?? 0,
        width: USABLE_WIDTH,
        ...extraOpts,
    };
    doc.text(text, MARGIN_LEFT, undefined, opts);
    if (style.marginBottom) doc.moveDown(style.marginBottom / 12);
}

function drawHRule(doc: PDFKit.PDFDocument, color = '#b0b0b0'): void {
    const y = doc.y;
    doc.save()
        .moveTo(MARGIN_LEFT, y)
        .lineTo(PAGE_WIDTH - MARGIN_RIGHT, y)
        .lineWidth(0.5)
        .strokeColor(color)
        .stroke()
        .restore();
    doc.moveDown(0.3);
}

function drawIndexTable(doc: PDFKit.PDFDocument, lines: string[]): void {
    const colWidths = [1.5 * CM, 11 * CM, 2.5 * CM];
    const rowH = 18;
    const startX = MARGIN_LEFT;

    // Header row
    const headers = ['S.No.', 'Particulars / Documents', 'Page No.'];
    let y = doc.y;

    // Draw header
    doc.font(FONT_BOLD).fontSize(10).fillColor('#000000');
    headers.forEach((h, ci) => {
        const x = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
        doc.rect(x, y, colWidths[ci], rowH).strokeColor('#999999').lineWidth(0.5).stroke();
        doc.text(h, x + 2, y + 4, { width: colWidths[ci] - 4, align: 'center' });
    });
    y += rowH;

    // Data rows
    doc.font(FONT_NORMAL).fontSize(10);
    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/\s{2,}/);
        const cells = parts.length >= 2
            ? [parts[0], parts[1], parts[2] ?? '—']
            : [line, '', ''];
        const aligns: ('center' | 'left' | 'center')[] = ['center', 'left', 'center'];

        cells.forEach((cell, ci) => {
            const x = startX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0);
            doc.rect(x, y, colWidths[ci], rowH).strokeColor('#999999').lineWidth(0.5).stroke();
            doc.text(cell, x + 2, y + 4, { width: colWidths[ci] - 4, align: aligns[ci] });
        });
        y += rowH;
    }
    doc.y = y + 16;
}

function drawExecutionBlock(doc: PDFKit.PDFDocument, signatures: string[]): void {
    const colW = signatures.length === 2 ? USABLE_WIDTH / 2 : USABLE_WIDTH;
    const startY = doc.y + 15;

    signatures.forEach((sig, i) => {
        const x = MARGIN_LEFT + i * colW;
        let y = startY;
        doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
        doc.text(sig, x, y, { width: colW - 8, align: 'justify' }); y += 28;
        doc.font(FONT_NORMAL).fontSize(11);
        ['Signature: ___________________________', 'Name:      ___________________________', 'Title:     ___________________________', 'Date:      ___________________________']
            .forEach(field => { doc.text(field, x, y, { width: colW - 8 }); y += 20; });
    });
    doc.moveDown(2);
}

function drawPartyRow(doc: PDFKit.PDFDocument, name: string, role: string): void {
    const y = doc.y;
    doc.font(FONT_BOLD).fontSize(11).fillColor('#000000');
    doc.text(name, MARGIN_LEFT, y, { width: USABLE_WIDTH * 0.70, align: 'left' });
    doc.text(role, MARGIN_LEFT + USABLE_WIDTH * 0.70, y, { width: USABLE_WIDTH * 0.30, align: 'right' });
    doc.moveDown(0.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL RENDERING ENGINE
// ─────────────────────────────────────────────────────────────────────────────
export class LegalDocumentRenderer {
    private docType: string;
    private outputPath: string;
    private layoutStrategy: 'COURT' | 'CONTRACT' | 'NOTICE';

    constructor(docType: string, outputPath: string) {
        this.docType = docType.toUpperCase().trim().replace(/\s+/g, '_');
        this.outputPath = outputPath;

        if (SECTOR_MAPPING.CLASS_A_COURT.has(this.docType)) {
            this.layoutStrategy = 'COURT';
        } else if (SECTOR_MAPPING.CLASS_C_NOTICES.has(this.docType)) {
            this.layoutStrategy = 'NOTICE';
        } else {
            this.layoutStrategy = 'CONTRACT';
        }
    }

    public async render(rawContent: string): Promise<string> {
        const content = cleanText(rawContent);
        const lines = content.split('\n');

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
            bufferPages: true,
            autoFirstPage: true,
        });

        // Footer on every page
        doc.on('pageAdded', () => {
            // footer drawn after all pages via buffering — handled below
        });

        const stream = fs.createWriteStream(this.outputPath);
        doc.pipe(stream);

        switch (this.layoutStrategy) {
            case 'COURT':    this.generateCourtLayout(doc, lines);    break;
            case 'NOTICE':   this.generateNoticeLayout(doc, lines);   break;
            case 'CONTRACT': this.generateContractLayout(doc, lines); break;
        }

        // Draw footer on all buffered pages
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            const footerY = doc.page.height - MARGIN_BOTTOM + 8;
            doc.save()
                .moveTo(MARGIN_LEFT, footerY)
                .lineTo(PAGE_WIDTH - MARGIN_RIGHT, footerY)
                .lineWidth(0.5).strokeColor('#b0b0b0').stroke()
                .restore();
            doc.font(FONT_NORMAL).fontSize(9).fillColor('#444444');
            doc.text(`Page ${i + 1}`, MARGIN_LEFT, footerY + 6, { width: USABLE_WIDTH, align: 'center' });
        }

        doc.end();

        await new Promise<void>((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        return this.outputPath;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COURT LAYOUT (CLASS A)
    // ─────────────────────────────────────────────────────────────────────────
    private generateCourtLayout(doc: PDFKit.PDFDocument, lines: string[]): void {
        let idx = 0; let inIndex = false; const indexLines: string[] = [];

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (isCourtHeader(stripped, idx)) {
                addText(doc, stripped.toUpperCase(), STYLES.courtHeader); idx++; continue;
            }
            if (isCaseNumber(stripped)) {
                addText(doc, stripped, STYLES.caseNumber); idx++; continue;
            }
            if (isVersus(stripped)) {
                addText(doc, 'VERSUS', STYLES.versus); idx++; continue;
            }
            if (/[.…·_-]+\s*(Petitioner|Plaintiff|Complainant|Accused|Opp\.? Party|Respondent)/i.test(line)) {
                const match = line.match(/(.+?)([\s.…·_-]+\b(Petitioner|Plaintiff|Complainant|Accused|Opp\.? Party|Respondent)\b)/i);
                if (match) drawPartyRow(doc, match[1].trim(), match[2].replace(/[.…·_-]/g, '').trim());
                else addText(doc, stripped, STYLES.bodyBold);
                idx++; continue;
            }
            if (isIndexStart(stripped)) {
                inIndex = true;
                addText(doc, 'INDEX', { ...STYLES.clauseHeading, align: 'center' });
                idx++; continue;
            }
            if (inIndex) {
                if (/IN THE COURT|BEFORE THE/i.test(stripped)) {
                    if (indexLines.length) drawIndexTable(doc, indexLines);
                    inIndex = false;
                    doc.addPage();
                    addText(doc, stripped.toUpperCase(), STYLES.courtHeader);
                } else { indexLines.push(stripped); }
                idx++; continue;
            }
            if (/^(MOST RESPECTFULLY SHEWETH|HUMBLE PETITION)/i.test(stripped)) {
                addText(doc, stripped + ':', STYLES.bodyBold, { indent: 0 }); idx++; continue;
            }
            if (/^(:?\s*)AFFIDAVIT/i.test(stripped)) {
                doc.addPage();
                addText(doc, 'AFFIDAVIT', STYLES.courtHeader); idx++; continue;
            }
            if (isDisclaimer(stripped)) {
                addText(doc, stripped, STYLES.disclaimer); idx++; continue;
            }

            addText(doc, stripped, { ...STYLES.body, indent: stripped.startsWith('That') ? 30 : 0 });
            idx++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTRACT LAYOUT (CLASS B)
    // ─────────────────────────────────────────────────────────────────────────
    private generateContractLayout(doc: PDFKit.PDFDocument, lines: string[]): void {
        let idx = 0; let inRecitals = false; const discoveredSignatures: string[] = [];

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (isDocTitle(stripped, idx)) {
                addText(doc, stripped, STYLES.docTitle); idx++; continue;
            }
            if (isBetweenLabel(stripped) || stripped.startsWith("NOW THIS AGREEMENT")) {
                addText(doc, stripped, STYLES.body); idx++; continue;
            }
            if (isRecitalHeader(stripped)) {
                inRecitals = true;
                addText(doc, stripped.toUpperCase(), STYLES.clauseHeading); idx++; continue;
            }
            if (inRecitals && isRecitalLine(stripped)) {
                addText(doc, stripped, STYLES.indentBlock); idx++; continue;
            }
            if (isClauseHeading(stripped)) {
                inRecitals = false;
                addText(doc, stripped, STYLES.clauseHeading); idx++; continue;
            }

            if (/^For and on behalf of/i.test(stripped) || (isWitnessHeader(stripped) && idx > lines.length - 30)) {
                if (/^For/i.test(stripped)) discoveredSignatures.push(stripped.replace(/^For and on behalf of\s*/i, ''));
                idx++;
                while (idx < lines.length) {
                    const trace = lines[idx].trim();
                    if (/^For/i.test(trace)) discoveredSignatures.push(trace.replace(/^For and on behalf of\s*/i, ''));
                    if (isDisclaimer(trace)) break;
                    idx++;
                }
                if (discoveredSignatures.length) drawExecutionBlock(doc, discoveredSignatures);
                continue;
            }

            if (isDisclaimer(stripped)) {
                addText(doc, stripped, STYLES.disclaimer); idx++; continue;
            }

            addText(doc, stripped, isSubClause(line) ? STYLES.indentBlock : STYLES.body);
            idx++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOTICE LAYOUT (CLASS C)
    // ─────────────────────────────────────────────────────────────────────────
    private generateNoticeLayout(doc: PDFKit.PDFDocument, lines: string[]): void {
        let idx = 0; let contextAvis = false;

        while (idx < lines.length) {
            const line = lines[idx]; const stripped = line.trim();
            if (!stripped) { idx++; continue; }

            if (!contextAvis && !stripped.startsWith("To")) {
                addText(doc, stripped, idx === 0 ? STYLES.bodyBold : STYLES.noticeAddress); idx++; continue;
            }
            if (/^(To|TO,)/.test(stripped)) {
                contextAvis = true;
                addText(doc, 'To,', STYLES.noticeAddress, { indent: 0 }); idx++; continue;
            }
            if (isSubjectLine(stripped) || stripped.toUpperCase().startsWith("SUBJECT")) {
                addText(doc, stripped, STYLES.bodyBold); idx++; continue;
            }
            if (/Sincerely|Faithfully|Regards/i.test(stripped)) {
                doc.moveDown(1.5);
                addText(doc, stripped, STYLES.body); idx++; continue;
            }
            if (isDisclaimer(stripped)) {
                addText(doc, stripped, STYLES.disclaimer); idx++; continue;
            }

            addText(doc, stripped, STYLES.body);
            idx++;
        }
    }
}