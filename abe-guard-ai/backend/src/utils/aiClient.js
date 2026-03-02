/**
 * AI Client Utility
 * 
 * Provides a unified interface for AI providers (DeepSeek, OpenAI)
 * with automatic fallback and provider selection via environment variables
 * 
 * Strategy:
 * - Chat completions: Use DeepSeek (cheaper) with OpenAI fallback
 * - Embeddings: Always use OpenAI (DeepSeek doesn't offer embeddings)
 */

const OpenAI = require("openai");

// Provider configuration
const AI_PROVIDER = process.env.AI_PROVIDER || "openai"; // 'deepseek' or 'openai'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Model configuration
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Create AI client for chat completions
 * Prefers DeepSeek if available, falls back to OpenAI
 */
function createChatClient() {
  // Try DeepSeek first if configured
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

  // Fallback to OpenAI
  if (OPENAI_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: OPENAI_API_KEY,
      }),
      provider: "openai",
      model: OPENAI_MODEL,
    };
  }

  // No AI available
  return null;
}

/**
 * Create OpenAI client for embeddings (always OpenAI)
 */
function createEmbeddingsClient() {
  if (!OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
}

/**
 * Get the appropriate model name for chat completions
 */
function getChatModel() {
  if (AI_PROVIDER === "deepseek" && DEEPSEEK_API_KEY) {
    return DEEPSEEK_MODEL;
  }
  return OPENAI_MODEL;
}

/**
 * Check if AI is available for chat completions
 */
function isChatAvailable() {
  return !!(DEEPSEEK_API_KEY || OPENAI_API_KEY);
}

/**
 * Check if embeddings are available (OpenAI only)
 */
function isEmbeddingsAvailable() {
  return !!OPENAI_API_KEY;
}

/**
 * Get current provider info (for logging/debugging)
 */
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
