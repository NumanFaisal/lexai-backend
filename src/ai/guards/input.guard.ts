// src/ai/guards/input.guard.ts
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../config/logger';

export class InputGuard {
  // Blacklist of terms that indicate prompt injection or system prompt extraction
  private static readonly INJECTION_PATTERNS = [
    /ignore previous instructions/i,
    /system prompt/i,
    /you are a developer/i,
    /print your instructions/i,
    /forget all rules/i,
    /write a python script/i, // LexAI shouldn't write code
    /jailbreak/i,
  ];

  static validate(inputText: string): void {
    if (!inputText || inputText.trim().length === 0) return;

    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(inputText)) {
        logger.warn({ msg: '[InputGuard] Blocked malicious input', input: inputText.slice(0, 100) });
        throw new AppError(
          "I am a legal AI assistant. I cannot comply with instructions that attempt to alter my core programming or generate non-legal outputs.",
          400,
          false
        );
      }
    }
  }
}