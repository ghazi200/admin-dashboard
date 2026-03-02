// backend/src/services/policyChunking.service.js
function chunkText(text, chunkSize = 900, overlap = 150) {
  const clean = (text || "").replace(/\r/g, "").trim();
  if (!clean) return [];

  const chunks = [];
  let i = 0;

  while (i < clean.length) {
    const end = Math.min(clean.length, i + chunkSize);
    const part = clean.slice(i, end).trim();
    if (part) chunks.push(part);

    if (end === clean.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

module.exports = { chunkText };
