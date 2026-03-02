// backend/src/services/policyRag.service.js
const { embedOne, toPgVectorLiteral } = require("./embeddings.service");

function roleRank(role) {
  if (role === "admin") return 3;
  if (role === "supervisor") return 2;
  if (role === "guard") return 1;
  return 0;
}

function visibilityAllows(docVisibility, role) {
  if (docVisibility === "all") return true;
  if (docVisibility === "guard") return roleRank(role) >= 1;
  if (docVisibility === "supervisor") return roleRank(role) >= 2;
  if (docVisibility === "admin") return roleRank(role) >= 3;
  return false;
}

function buildSafeAnswer(question, chunks) {
  const citations = chunks.map((c) => ({
    documentId: c.document_id,
    chunkId: c.id,
    title: c.document_title,
    section: c.section_title || null,
    pages: c.page_start || c.page_end ? [c.page_start || null, c.page_end || null] : null,
    score: c.score ?? null,
    distance: c.distance ?? null,
  }));

  const excerpt = chunks
    .slice(0, 3)
    .map((c, i) => `Source ${i + 1}: ${String(c.content || "").trim().slice(0, 700)}${c.content?.length > 700 ? "…" : ""}`)
    .join("\n\n");

  const answer =
    `Based on the policy sources below, here’s what applies:\n\n` +
    `${excerpt}\n\n` +
    `If your situation is an edge case or the policy wording doesn’t exactly match, request a supervisor to confirm.`;

  return { answer, citations };
}

/**
 * Vector search (pgvector) primary:
 * - requires policy_chunks.embedding filled
 * - uses <-> distance operator
 *
 * Fallback: keyword score search
 */
async function retrievePolicyChunks({ models, tenantId, siteId, role, query, limit = 6 }) {
  const { sequelize, PolicyDocument, PolicyChunk } = models;

  // Try to embed query (may return null when OPENAI_API_KEY missing)
  let qVec = null;
  try {
    qVec = await embedOne(query);
  } catch (_) {
    qVec = null;
  }

  // =========================
  // Vector search (pgvector)
  // =========================
  if (qVec && Array.isArray(qVec) && qVec.length) {
    const qLit = toPgVectorLiteral(qVec);

    const rows = await sequelize.query(
      `
      SELECT
        c.id,
        c.tenant_id,
        c.site_id,
        c.document_id,
        c.chunk_index,
        c.section_title,
        c.page_start,
        c.page_end,
        c.content,
        d.title AS document_title,
        d.visibility AS document_visibility,
        (c.embedding <-> (:qvec::vector)) AS distance
      FROM policy_chunks c
      JOIN policy_documents d ON d.id = c.document_id
      WHERE
        c.tenant_id = :tenantId
        AND d.tenant_id = :tenantId
        AND d.is_active = true
        AND c.embedding IS NOT NULL
        AND (
          d.site_id IS NULL
          OR (:siteId::uuid IS NOT NULL AND d.site_id = :siteId::uuid)
        )
      ORDER BY c.embedding <-> (:qvec::vector)
      LIMIT 50
      `,
      {
        replacements: {
          tenantId,
          siteId: siteId || null,
          qvec: qLit,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const filtered = rows
      .filter((r) => visibilityAllows(r.document_visibility, role))
      .slice(0, limit)
      .map((r) => ({ ...r, score: null }));

    if (filtered.length) return filtered;
    // else fallback to keyword
  }

  // =========================
  // Keyword fallback (NO OpenAI key needed)
  // Use SQL ILIKE + proper joins, then filter visibility
  // Split query into words and search for ANY word match
  // =========================
  const q = String(query || "").trim();
  if (!q) return [];

  // Split query into individual words (remove common words like "what", "is", "the")
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !["what", "the", "for", "and", "are", "all"].includes(w));

  if (words.length === 0) {
    // If all words were filtered out, use the original query
    words.push(q.toLowerCase());
  }

  // Build ILIKE conditions for each word (OR logic - match any word)
  const wordConditions = words.map((_, i) => `c.content ILIKE :word${i}`).join(" OR ");
  const wordParams = {};
  words.forEach((word, i) => {
    wordParams[`word${i}`] = `%${word}%`;
  });

  const rows = await sequelize.query(
    `
    SELECT
      c.id,
      c.tenant_id,
      c.site_id,
      c.document_id,
      c.chunk_index,
      c.section_title,
      c.page_start,
      c.page_end,
      c.content,
      d.title AS document_title,
      d.visibility AS document_visibility,
      NULL::float8 AS distance
    FROM policy_chunks c
    JOIN policy_documents d ON d.id = c.document_id
    WHERE
      c.tenant_id = :tenantId
      AND d.tenant_id = :tenantId
      AND d.is_active = true
      AND (
        d.site_id IS NULL
        OR (:siteId::uuid IS NOT NULL AND d.site_id = :siteId::uuid)
      )
      AND (${wordConditions})
    ORDER BY c.created_at DESC
    LIMIT 50
    `,
    {
      replacements: {
        tenantId,
        siteId: siteId || null,
        ...wordParams,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const filtered = rows
    .filter((r) => visibilityAllows(r.document_visibility, role))
    .slice(0, limit)
    .map((r) => ({ ...r, score: null }));

  return filtered;
}

module.exports = {
  retrievePolicyChunks,
  buildSafeAnswer,
};
