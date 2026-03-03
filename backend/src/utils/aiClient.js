/**
 * AI Client Utility (admin backend copy)
 *
 * Same interface as abe-guard-ai/backend/src/utils/aiClient for Command Center AI.
 * Uses OpenAI (and optional DeepSeek via env) for chat completions.
 */

const OpenAI = require("openai");

const AI_PROVIDER = process.env.AI_PROVIDER || "openai";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function createChatClient() {
  if (AI_PROVIDER === "deepseek" && DEEPSEEK_API_KEY) {
    try {
      return {
        client: new OpenAI({
          apiKey: DEEPSEEK_API_KEY,
          baseURL: "https://api.deepseek.com",
        }),
        provider: "deepseek",
        model: DEEPSEEK_MODEL,
      };
    } catch (error) {
      console.warn("⚠️  Failed to initialize DeepSeek client, falling back to OpenAI:", error.message);
    }
  }
  if (OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: OPENAI_API_KEY }),
      provider: "openai",
      model: OPENAI_MODEL,
    };
  }
  return null;
}

function createEmbeddingsClient() {
  if (!OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

function getChatModel() {
  if (AI_PROVIDER === "deepseek" && DEEPSEEK_API_KEY) return DEEPSEEK_MODEL;
  return OPENAI_MODEL;
}

function isChatAvailable() {
  return !!(DEEPSEEK_API_KEY || OPENAI_API_KEY);
}

function isEmbeddingsAvailable() {
  return !!OPENAI_API_KEY;
}

function getProviderInfo() {
  return {
    chatProvider: AI_PROVIDER === "deepseek" && DEEPSEEK_API_KEY ? "deepseek" : "openai",
    embeddingsProvider: "openai",
    chatModel: getChatModel(),
    chatAvailable: isChatAvailable(),
    embeddingsAvailable: isEmbeddingsAvailable(),
  };
}

module.exports = {
  createChatClient,
  createEmbeddingsClient,
  getChatModel,
  isChatAvailable,
  isEmbeddingsAvailable,
  getProviderInfo,
};
