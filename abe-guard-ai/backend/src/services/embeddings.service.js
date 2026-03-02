// backend/src/services/embeddings.service.js
"use strict";

const OpenAI = require("openai");

const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
}

// Create client lazily so missing key doesn't crash app
function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function embedOne(text) {
  const input = (text || "").trim();
  if (!input) return null;

  // ✅ No key yet → stub mode (return null, caller should fallback)
  if (!hasOpenAIKey()) return null;

  const openai = getOpenAIClient();

  const resp = await openai.embeddings.create({
    model: MODEL,
    input,
  });

  const v = resp?.data?.[0]?.embedding;
  return Array.isArray(v) ? v : null;
}

// pgvector accepts: '[1,2,3]'
function toPgVectorLiteral(vec) {
  if (!Array.isArray(vec)) return null;
  return `[${vec.join(",")}]`;
}

module.exports = { embedOne, toPgVectorLiteral, MODEL, hasOpenAIKey };
