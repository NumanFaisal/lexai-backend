// src/modules/workers/voice.worker.ts
import { Worker, Job } from 'bullmq';
import { redisClient } from '../../config/redis';
import { logger } from '../../config/logger';

// Ensure your S3/R2 client has a getFileBuffer method, or download it using fetch
export const voiceProcessingWorker = new Worker(
  'voice-processing-queue',
  async (job: Job) => {
    const { userId } = job.data;
    logger.info(`🎙️ Starting Background Voice Processing for User: ${userId}`);

    try {
      // 1. Download the audio file from R2
      // Note: You might need to add a `downloadFileBuffer` method to your `r2.storage.ts`
      // Or if the file is passed as a direct signed URL, fetch it.
      // For this example, assuming you have the buffer:
      // const audioBuffer = await r2Storage.downloadFileBuffer(r2Key);
      
      // 2. Call Whisper
      // const transcribedText = await WhisperProvider.transcribeHindiAudio(audioBuffer, filename, mimetype);

      // 3. Save to Database
      // await saveVoiceTranscription({
      //   userId,
      //   transcript: transcribedText,
      //   source: QuerySource.WHATSAPP, // or WEB depending on payload
      //   detectedLang: 'hi'
      // });

      logger.info(`✅ Voice processed successfully for ${userId}`);
      // return { success: true, text: transcribedText };
      return { success: true };
    } catch (error) {
      logger.error({ msg: `Voice processing failed`, error: (error as Error).message });
      throw error;
    }
  },
  { connection: redisClient }
);

voiceProcessingWorker.on('error', (err) => {
  if (err.message.includes('ECONNREFUSED')) return;
  logger.error('voiceProcessingWorker Error: ' + err.message);
});