import { getUserVoiceTranscriptions, countUserVoiceTranscriptions } from './voice.repository';

export const fetchUserTranscriptions = async (userId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;
  const [transcriptions, total] = await Promise.all([
    getUserVoiceTranscriptions(userId, limit, skip),
    countUserVoiceTranscriptions(userId)
  ]);

  return {
    transcriptions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};