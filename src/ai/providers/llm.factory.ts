import { env } from "../../config/env";
import { LLMConfig, SupportedModel } from "@/config/llm.config";
export { LLMConfig, SupportedModel };
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";



export const getLLM = (
  model: SupportedModel,
  config: LLMConfig = {}
) => {
  const {
    temperature = 0.1,
    maxTokens = 2000,
    timeout = 30000,
  } = config;

  switch (model) {
    case "gpt-4o":
      return new ChatOpenAI({
        model: "gpt-4o",
        temperature,
        maxTokens,
        timeout,
        apiKey: env.OPENAI_API_KEY,
      });

    case "claude-3-5-sonnet":
      return new ChatAnthropic("claude-3-5-sonnet",{
        temperature,
        maxTokens,
        apiKey: env.ANTHROPIC_API_KEY,
      });

    case "gemini-1.5-pro":
      return new ChatGoogleGenerativeAI("gemini-1.5-pro", {
        temperature,
        maxOutputTokens: maxTokens,
        apiKey: env.GOOGLE_API_KEY,
      });

    case "gemini-2.0-flash":
      return new ChatGoogleGenerativeAI("gemini-2.0-flash",{
        temperature,
        maxOutputTokens: maxTokens,
        apiKey: env.GOOGLE_API_KEY,
      });

    default:
      throw new Error(`Unsupported model: ${model}`);
  }
};