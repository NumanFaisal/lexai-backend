import { env } from '../../config/env';
import { logger } from '../../config/logger';

export class WhisperProvider {
  // Transcribes audio to text using OpenAI Whisper API.
  // Hardcoded to hindi for maximum accuracy with Indian user input

  static async transcribeHindiAudio(buffer: Buffer, originalFilename: string, mimetype: string): Promise<string> {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });

      // Browsers often send blobs without extensions. We must enforce .webm or .wav.
      let safeFilename = originalFilename || 'audio.webm';
      if (!safeFilename.includes('.')) {
        safeFilename += mimetype.includes('wav') ? '.wav' : '.webm';
      }

      formData.append('file', blob, safeFilename);
      formData.append('model', 'whisper-1');
      formData.append('language', 'hi'); // force hindi language model
      formData.append('response_format', 'text');
      formData.append('temperature', '0.2'); // low teemp for more focused, accurate STT


      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: formData as any
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Whisper API Error: ${errorText}`)
      }

      const text = await response.text();
      return text.trim();

    } catch (error: any) {
      logger.error({ msg: '[WhisperProvider] Failed to transcribe Hindi audio', error: (error as Error).message });
      throw error;
    }
  }
}