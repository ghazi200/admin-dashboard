/**
 * AI Client Utility (admin backend)
 *
 * Chat: OpenAI and/or DeepSeek, ordered by AI_PROVIDER with automatic fallback.
 * Embeddings: OpenAI only.
 */

const OpenAI = require("openai");

const AI_PROVIDER = String(process.env.AI_PROVIDER || "openai").toLowerCase().trim();
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function makeDeepSeekClient() {
  if (!DEEPSEEK_API_KEY) return null;
  return {
    client: new OpenAI({
      apiKey: DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    }),
    provider: "deepseek",
    model: DEEPSEEK_MODEL,
  };
}

function makeOpenAIClient() {
  if (!OPENAI_API_KEY) return null;
  return {
    client: new OpenAI({ apiKey: OPENAI_API_KEY }),
    provider: "openai",
    model: OPENAI_MODEL,
  };
}

/**
 * Ordered chat clients for try → fallback.
 * Preferred provider first when its key exists; other provider second if keyed.
 */
function listChatClients() {
  const deepseek = makeDeepSeekClient();
  const openai = makeOpenAIClient();
  const preferDeepseek = AI_PROVIDER === "deepseek";

  const ordered = [];
  if (preferDeepseek) {
    if (deepseek) ordered.push(deepseek);
    if (openai) ordered.push(openai);
  } else {
    if (openai) ordered.push(openai);
    if (deepseek) ordered.push(deepseek);
  }
  return ordered;
}

function createChatClient() {
  const list = listChatClients();
  return list[0] || null;
}

function createEmbeddingsClient() {
  if (!OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

function getChatModel() {
  const primary = createChatClient();
  return primary?.model || OPENAI_MODEL;
}

function isChatAvailable() {
  return !!(DEEPSEEK_API_KEY || OPENAI_API_KEY);
}

function isEmbeddingsAvailable() {
  return !!OPENAI_API_KEY;
}

function getProviderInfo() {
  const primary = createChatClient();
  return {
    preferredProvider: AI_PROVIDER === "deepseek" ? "deepseek" : "openai",
    chatProvider: primary?.provider || null,
    chatModel: primary?.model || null,
    fallbackProviders: listChatClients()
      .slice(1)
      .map((c) => c.provider),
    openaiKeySet: !!OPENAI_API_KEY,
    deepseekKeySet: !!DEEPSEEK_API_KEY,
    chatAvailable: isChatAvailable(),
    embeddingsAvailable: isEmbeddingsAvailable(),
  };
}

function isBillingOrQuotaError(error) {
  const status = error?.status || error?.response?.status;
  const msg = String(error?.message || "").toLowerCase();
  return (
    status === 402 ||
    status === 429 ||
    msg.includes("quota") ||
    msg.includes("billing") ||
    msg.includes("insufficient balance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("payment")
  );
}

/**
 * Try each configured chat provider until one succeeds.
 * @returns {{ completion: any, provider: string, model: string }}
 */
async function chatCompletionsCreate(params) {
  const clients = listChatClients();
  if (!clients.length) {
    const err = new Error("No AI chat provider configured (set OPENAI_API_KEY and/or DEEPSEEK_API_KEY)");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  let lastError = null;
  for (const cfg of clients) {
    try {
      const completion = await cfg.client.chat.completions.create({
        ...params,
        model: params.model || cfg.model,
      });
      return { completion, provider: cfg.provider, model: cfg.model };
    } catch (error) {
      lastError = error;
      const billing = isBillingOrQuotaError(error);
      console.warn(
        `⚠️  ${cfg.provider.toUpperCase()} chat failed (${error.status || "err"}): ${error.message}` +
          (billing && clients.length > 1 ? " — trying fallback provider" : "")
      );
      if (!billing && clients.length > 1) {
        // Non-billing errors: still try fallback (e.g. model not found)
        continue;
      }
      if (billing) continue;
    }
  }
  throw lastError;
}

module.exports = {
  createChatClient,
  createEmbeddingsClient,
  listChatClients,
  chatCompletionsCreate,
  getChatModel,
  isChatAvailable,
  isEmbeddingsAvailable,
  getProviderInfo,
  isBillingOrQuotaError,
};
