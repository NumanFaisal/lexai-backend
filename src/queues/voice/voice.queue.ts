import { Queue } from 'bullmq';
import { redisClient } from '../../config/redis';

export const voiceQueue = new Queue('voice-processing-queue', { connection: redisClient });

export const addVoiceJob = async (userId: string, r2Key: string, filename: string, mimetype: string) => {
  return await voiceQueue.add('transcribe-hindi', {
    userId,
    r2Key,
    filename,
    mimetype
  });
};