// src/queues/pdf/pdf.processor.ts
import { Job } from 'bullmq';
import { processPdfGenerationJob } from '../../modules/workers/pdf.worker';

export async function pdfQueueProcessor(job: Job) {
    
    const { draftedContent, documentType, outputPath } = job.data;
    
    // This feeds right into your legalPdfRenderer!
    const result = await processPdfGenerationJob({
        content: draftedContent,
        docType: documentType,
        outputPath: outputPath
    });

    return result;
}