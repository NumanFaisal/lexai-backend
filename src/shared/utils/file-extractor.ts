const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { env } from '../../config/env';

export class FileExtractor {
  
  static async extractText(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
    
    // 1. PDF
    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text;
    }
    
    // 2. DOCX
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    
    // 3. Audio (Whisper)
    if (mimetype.startsWith('audio/')) {
      return await this.extractAudioText(buffer, originalName);
    }
    
    // 4. Image (Vision via Gemini or OpenAI)
    if (mimetype.startsWith('image/')) {
      return await this.extractImageText(buffer, mimetype);
    }
    
    throw new Error(`Unsupported file type: ${mimetype}`);
  }

  private static async extractAudioText(buffer: Buffer, filename: string): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: formData as any
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Whisper API failed: ${error}`);
    }

    const data = await response.json();
    return data.text;
  }

  private static async extractImageText(buffer: Buffer, mimetype: string): Promise<string> {
    // We can use Gemini Pro Vision for image text extraction
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      apiKey: env.GOOGLE_API_KEY,
    });

    const base64Image = buffer.toString('base64');
    
    const message = new HumanMessage({
      content: [
        { type: "text", text: "Please extract all text from this image and describe any key visual diagrams or context." },
        { 
          type: "image_url", 
          image_url: { url: `data:${mimetype};base64,${base64Image}` } 
        }
      ]
    });

    const response = await model.invoke([message]);
    return response.content as string;
  }
}
