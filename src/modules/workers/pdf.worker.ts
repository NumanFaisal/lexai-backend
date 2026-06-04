import { LegalDocumentRenderer } from "./legalPdfRenderer";

export async function processPdfGenerationJob(jobData: { content: string; docType: string; outputPath: string }) {
    try {
        console.log("📥 [PDF Worker] Ingested Job Data:");
        console.log(`   - DocType Received: "${jobData.docType}"`);
        console.log(`   - Output Path: "${jobData.outputPath}"`);
        console.log(`   - Content Preview: "${jobData.content?.substring(0, 100)}..."`);
        
        const renderer = new LegalDocumentRenderer(jobData.docType, jobData.outputPath);
        await renderer.render(jobData.content);
        return { success: true, path: jobData.outputPath };
    } catch (error) {
        console.error("Failed to generate styled court document:", error);
        throw error;
    }
}