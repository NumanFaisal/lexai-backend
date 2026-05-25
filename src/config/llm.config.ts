export type SupportedModel =
  | "claude-3-5-sonnet"
  | "gpt-4o"
  | "gemini-1.5-pro"
  | "gemini-2.0-flash";

export interface LLMConfig {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export const DEFAULT_LLM_CONFIG: Required<LLMConfig> = {
  temperature: 0.1,
  maxTokens: 2000,
  timeout: 30000,
};