import prisma from '../../config/db';
import { NotFoundError } from '../../shared/errors/AppError';
import { DraftStatus } from '@prisma/client';
import crypto from 'crypto';
import { r2Storage } from '../../infrastructure/storage/r2.storage';
// @ts-ignore
import HTMLToDocx from 'html-to-docx';
import { reviewAgent } from '../../ai/agents/drafting/review.agent';
import { analysisAgent } from '../../ai/agents/drafting/analysis.agent';

export const getUserDrafts = async (userId: string) => {
  return await prisma.draft.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
};

export const createDraft = async (userId: string, templateId: string | undefined, title: string, content: string) => {
  return await prisma.draft.create({
    data: {
      userId,
      templateId,
      title,
      content,
      status: DraftStatus.IN_PROGRESS,
    },
  });
};

export const updateDraft = async (userId: string, draftId: string, data: { title?: string; content?: string; status?: DraftStatus }) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw new NotFoundError('Draft not found');
  }

  return await prisma.draft.update({
    where: { id: draftId },
    data,
  });
};

export const deleteDraft = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw new NotFoundError('Draft not found');
  }

  return await prisma.draft.delete({
    where: { id: draftId },
  });
};

export const exportDraftAsDocx = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Sanitize HTML before DOCX conversion (strips colored placeholder badges)
  const cleanHTML = sanitizeHTMLForExport(draft.content);

  // Convert the sanitized HTML to a DOCX buffer
  const docxBuffer = await HTMLToDocx(cleanHTML, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    font: 'Times New Roman',
    fontSize: 24, // 12pt in half-points
    margins: { top: 1440, right: 1134, bottom: 1440, left: 1701 }, // legal margins in twips
  });

  const r2Key = `users/${userId}/drafts/${draftId}_${draft.title.replace(/\s+/g, '_')}.docx`;
  
  await r2Storage.uploadFile(r2Key, docxBuffer as Buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  await prisma.draft.update({
    where: { id: draftId },
    data: { docxUrl: r2Key, docxGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};

/**
 * Strip Tiptap/LexAI-specific attributes from HTML so the exported document
 * is clean (no colored placeholder badges, no data-* attributes, no class noise).
 */
function sanitizeHTMLForExport(html: string): string {
  // Replace placeholder span nodes with their plain text content
  // e.g. <span data-type="template-placeholder" ...>advocate_name</span> → advocate_name
  let clean = html.replace(
    /<span[^>]*data-type="template-placeholder"[^>]*>([^<]*(?:<(?!\/span)[^<]*)*)<\/span>/gi,
    (_match, inner) => {
      // strip any nested tags, keep text only
      return inner.replace(/<[^>]+>/g, '').trim() || '________________';
    }
  );
  // Remove Tiptap node view wrappers that may survive
  clean = clean.replace(/class="[^"]*"/g, '');
  clean = clean.replace(/data-[a-z\-]+="[^"]*"/g, '');
  return clean;
}

/**
 * Build a court-quality standalone HTML page for puppeteer rendering.
 * Uses Times New Roman 12pt, standard legal margins, justified text,
 * bold headings, and page numbers in the footer.
 */
function buildCourtHTML(title: string, bodyHTML: string): string {
  const clean = sanitizeHTMLForExport(bodyHTML);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    /* ── Court-standard print CSS ─────────────────────────────── */
    @page {
      size: A4;
      margin: 25mm 20mm 25mm 30mm; /* left wider for binding */
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #000;
      text-align: justify;
    }
    h1, h2, h3, h4 {
      font-family: 'Times New Roman', Times, serif;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 18pt;
      margin-bottom: 8pt;
    }
    h1 { font-size: 14pt; text-decoration: underline; }
    h2 { font-size: 13pt; text-decoration: underline; }
    h3 { font-size: 12pt; }
    h4 { font-size: 12pt; font-weight: bold; text-align: left; }
    p {
      margin-bottom: 8pt;
      text-indent: 0;
    }
    ul, ol {
      margin-left: 24pt;
      margin-bottom: 8pt;
    }
    li { margin-bottom: 4pt; }
    strong, b { font-weight: bold; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12pt;
      font-size: 11pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 6pt 8pt;
      text-align: left;
    }
    th { font-weight: bold; background: #f0f0f0; }
    /* Signature lines */
    .sig-line {
      display: inline-block;
      min-width: 180pt;
      border-bottom: 1px solid #000;
      margin: 0 4pt;
    }
    /* Page number footer */
    @page { @bottom-center { content: counter(page); font-family: 'Times New Roman', serif; font-size: 10pt; } }
  </style>
</head>
<body>
${clean}
</body>
</html>`;
}

export const exportDraftAsPdf = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Dynamic import of puppeteer to avoid startup cost when unused
  let puppeteer: any;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    throw new Error('puppeteer is not installed. Run: npm install puppeteer');
  }

  const htmlPage = buildCourtHTML(draft.title, draft.content);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let pdfBuffer: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(htmlPage, { waitUntil: 'networkidle0' });
    pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: false,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-family:'Times New Roman',serif;font-size:9pt;width:100%;text-align:center;color:#333;padding-bottom:4mm">
        <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
      margin: { top: '25mm', bottom: '20mm', left: '30mm', right: '20mm' },
    });
  } finally {
    await browser.close();
  }

  const r2Key = `users/${userId}/drafts/${draftId}_${draft.title.replace(/\s+/g, '_')}.pdf`;
  await r2Storage.uploadFile(r2Key, pdfBuffer as Buffer, 'application/pdf');

  await prisma.draft.update({
    where: { id: draftId },
    data: { pdfUrl: r2Key, pdfGeneratedAt: new Date() }
  });

  return await r2Storage.getSignedDownloadUrl(r2Key, 300);
};

export const enableShareLinkDraft = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const sharedToken = crypto.randomBytes(8).toString('hex');
  return await prisma.draft.update({
    where: { id: draftId },
    data: {
      isShared: true,
      sharedToken,
      sharedAt: new Date(),
    }
  });
};

export const getDraftSuggestions = async (userId: string, draftId: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  // Infer document type for checklists
  let docType = 'NDA';
  const title = draft.title.toLowerCase();
  if (title.includes('employment')) docType = 'EMPLOYMENT_AGREEMENT';
  else if (title.includes('rent') || title.includes('lease')) docType = 'RENT_AGREEMENT';
  else if (title.includes('vakalatnama')) docType = 'VAKALATNAMA';
  else if (title.includes('sale deed')) docType = 'SALE_DEED';
  else if (title.includes('power of attorney') || title.includes('gpa')) docType = 'POWER_OF_ATTORNEY';
  else if (title.includes('anticipatory bail')) docType = 'BAIL_APPLICATION';
  else if (title.includes('bail')) docType = 'BAIL_APPLICATION';
  
  const documentFields = analysisAgent.extractFieldsFromHTML(draft.content);
  const missingClauses = await analysisAgent.detectMissingClauses(draft.content, docType);
  const jurisWarnings = analysisAgent.checkJurisdictionConsistency(documentFields);

  const unifiedSuggestions = [
    ...missingClauses.map(m => ({
      id: Math.random().toString(36).substr(2, 9),
      type: m.severity === 'high' ? 'warning' : 'improvement',
      text: `Missing Clause: ${m.clauseType.replace(/_/g, ' ')}. ${m.suggestedAction}`,
      actionPrompt: m.suggestedAction
    })),
    ...jurisWarnings.map(j => ({
      id: Math.random().toString(36).substr(2, 9),
      type: 'warning',
      text: j.message,
      actionPrompt: 'Review Jurisdiction'
    }))
  ];

  // If no specific missing clauses, we can add a generic improvement
  if (unifiedSuggestions.length === 0) {
    unifiedSuggestions.push({
      id: Math.random().toString(36).substr(2, 9),
      type: 'improvement',
      text: 'Consider adding a severability and waiver clause for stronger enforceability.',
      actionPrompt: 'Add severability and waiver clauses'
    });
  }

  return unifiedSuggestions;
};

export type ReviseDraftResult =
  | { status: 'REVISED'; draft: any; summaryOfChanges: string }
  | { status: 'NEEDS_CLARIFICATION'; clarificationQuestion: string };

export const reviseDraft = async (userId: string, draftId: string, instruction: string): Promise<ReviseDraftResult> => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const result = await reviewAgent.reviseHTMLDocument(userId, draft.content, draft.title || 'Legal Document', instruction);

  if (result.status === 'NEEDS_CLARIFICATION') {
    return {
      status: 'NEEDS_CLARIFICATION',
      clarificationQuestion: result.clarificationQuestion!,
    };
  }

  const updatedDraft = await prisma.draft.update({
    where: { id: draftId },
    data: { content: result.revisedHTML! },
  });

  return {
    status: 'REVISED',
    draft: updatedDraft,
    summaryOfChanges: result.summaryOfChanges || 'Document updated.',
  };
};

/** Classify whether a user message is a revision command or a question. */
export const classifyIntent = (instruction: string) => reviewAgent.detectIntent(instruction);

export const askDraft = async (userId: string, draftId: string, question: string) => {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) throw new NotFoundError('Draft not found');

  const answer = await reviewAgent.answerQuestion(draft.content, draft.title || 'Legal Document', question);
  return answer;
};
