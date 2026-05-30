// src/shared/helpers/file.parser.ts
import { PDFParse } from 'pdf-parse';
import { AppError } from '../errors/AppError';

export const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
  try {
    // Handle PDFs
    if (file.mimetype === 'application/pdf') {
      const pdf = new PDFParse({ data: file.buffer });
      const pdfData = await pdf.getText();
      return pdfData.text;
    }
    
    // Handle Plain Text files
    if (file.mimetype === 'text/plain') {
      return file.buffer.toString('utf-8');
    }

    // Note: If you want to handle Image OCR (jpg/png) for photos of contracts, 
    // you would pass the image buffer directly to Gemini/GPT-4o Vision here.
    
    throw new AppError('Unsupported file type. Please upload a PDF or TXT file.', 400);
  } catch (error) {
    console.error("[File Parser] Error extracting text:", error);
    throw new AppError('Could not read the uploaded document.', 500);
  }
};