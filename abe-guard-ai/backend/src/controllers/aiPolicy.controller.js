// backend/src/controllers/aiPolicy.controller.js
const { extractTextFromPdf } = require("../services/pdfExtract.service");
const { chunkText } = require("../services/policyChunking.service");
const { embedOne } = require("../services/embeddings.service");
const { retrievePolicyChunks, buildSafeAnswer } = require("../services/policyRag.service");

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === "true";
}

function roleFromReq(req) {
  return req.user?.role || req.admin?.role || req.body.role || "guard";
}
function userIdFromReq(req) {
  return (
    req.user?.id ||
    req.user?.guardId ||
    req.admin?.id ||
    req.body.userId
  );
}


// ADMIN: upload policy document (file or rawText)
// - stores doc
// - if PDF and POLICY_AUTO_EXTRACT: extracts text
// - if POLICY_AUTO_CHUNK: chunks
// - if POLICY_AUTO_EMBED: embeds + saves vectors
exports.uploadPolicy = async (req, res) => {
  try {
    if (!req.app.locals || !req.app.locals.models) {
      console.error("❌ Models not loaded! req.app.locals:", req.app.locals);
      return res.status(500).json({ message: "Models not initialized" });
    }
    
    const { PolicyDocument, PolicyChunk } = req.app.locals.models;
    
    if (!PolicyDocument || !PolicyChunk) {
      console.error("❌ Policy models not found! Available models:", Object.keys(req.app.locals.models));
      return res.status(500).json({ message: "Policy models not found" });
    }

    const {
      tenantId,
      siteId = null,
      title,
      category = null,
      visibility = "all",
      rawText = null,
    } = req.body;

    if (!tenantId || !title) {
      return res.status(400).json({ message: "tenantId and title are required" });
    }

    const file = req.file || null;

    const doc = await PolicyDocument.create({
      tenant_id: tenantId,
      site_id: siteId || null,
      title,
      category,
      visibility,
      file_name: file ? file.originalname : null,
      file_mime: file ? file.mimetype : null,
      file_path: file ? file.path : null,
      raw_text: rawText || null,
      is_active: true,
      updated_at: new Date(),
    });

    let text = (rawText || "").trim();
    const autoExtract = envBool("POLICY_AUTO_EXTRACT", true);
    const autoChunk = envBool("POLICY_AUTO_CHUNK", true);
    const autoEmbed = envBool("POLICY_AUTO_EMBED", true);

    if (!text && file && autoExtract) {
      // only PDF extraction here (safe + predictable)
      const mime = String(file.mimetype || "");
      if (mime.includes("pdf")) {
        text = await extractTextFromPdf(file.path);
        if (text) {
          await doc.update({ raw_text: text, updated_at: new Date() });
        }
      }
    }

    let chunksCreated = 0;

    if (text && autoChunk) {
      const size = parseInt(process.env.POLICY_CHUNK_SIZE || "900", 10);
      const overlap = parseInt(process.env.POLICY_CHUNK_OVERLAP || "150", 10);

      const parts = chunkText(text, size, overlap);

      // create chunks
      const chunkRows = [];
      for (let i = 0; i < parts.length; i++) {
        chunkRows.push({
          tenant_id: tenantId,
          site_id: siteId || null,
          document_id: doc.id,
          chunk_index: i,
          content: parts[i],
        });
      }

      if (chunkRows.length) {
        const created = await PolicyChunk.bulkCreate(chunkRows, { returning: true });
        chunksCreated = created.length;

        if (autoEmbed) {
          // embed sequentially (safe). Later we can batch.
          // Note: If OPENAI_API_KEY is not set, embedOne returns null (ok, uses keyword search instead)
          for (const row of created) {
            try {
              const vec = await embedOne(row.content);
              if (vec && Array.isArray(vec)) {
                await PolicyChunk.update(
                  { embedding_json: vec }, // keep json copy too
                  { where: { id: row.id } }
                );
                // if pgvector column exists, update via raw SQL
                try {
                  await req.app.locals.models.sequelize.query(
                    `UPDATE policy_chunks SET embedding = :vec WHERE id = :id`,
                    {
                      replacements: {
                        vec: `[${vec.join(",")}]`,
                        id: row.id,
                      },
                    }
                  );
                } catch (pgErr) {
                  // If embedding vector column not present yet, it's fine
                  console.log("⚠️ pgvector update skipped (column may not exist):", pgErr.message);
                }
              }
            } catch (embedErr) {
              // Log but continue - embeddings are optional
              console.warn("⚠️ Embedding failed for chunk (continuing):", embedErr.message);
            }
          }
        }
      }
    }

    return res.json({
      ok: true,
      document: {
        id: doc.id,
        tenant_id: doc.tenant_id,
        site_id: doc.site_id,
        title: doc.title,
        category: doc.category,
        visibility: doc.visibility,
        file_name: doc.file_name,
        file_mime: doc.file_mime,
      },
      extractedText: Boolean(text),
      chunksCreated,
    });
  } catch (e) {
    console.error("uploadPolicy error:", e);
    console.error("uploadPolicy error stack:", e.stack);
    return res.status(500).json({ 
      message: "Server error",
      error: e.message,
      details: process.env.NODE_ENV === "development" ? e.stack : undefined
    });
  }
};

// ADMIN: re-chunk + re-embed a document from raw_text (or optionally extract again)
// List policy documents
exports.listDocuments = async (req, res) => {
  try {
    const { PolicyDocument } = req.app.locals.models;
    const { tenantId, siteId } = req.query;

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (siteId) where.site_id = siteId;

    const docs = await PolicyDocument.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: 500,
    });

    // Get chunk count for each document
    const { PolicyChunk } = req.app.locals.models;
    const docsWithChunks = await Promise.all(
      docs.map(async (doc) => {
        const chunkCount = await PolicyChunk.count({
          where: { document_id: doc.id },
        });
        return {
          id: doc.id,
          tenant_id: doc.tenant_id,
          site_id: doc.site_id,
          title: doc.title,
          category: doc.category,
          visibility: doc.visibility,
          is_active: doc.is_active,
          file_name: doc.file_name,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          chunk_count: chunkCount,
        };
      })
    );

    return res.json({ ok: true, rows: docsWithChunks });
  } catch (e) {
    console.error("listDocuments error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// Update document active status
exports.updateDocumentActive = async (req, res) => {
  try {
    const { PolicyDocument } = req.app.locals.models;
    const { id } = req.params;
    const { isActive } = req.body;

    const doc = await PolicyDocument.findByPk(id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    await doc.update({ is_active: isActive, updated_at: new Date() });

    return res.json({ ok: true, document: doc });
  } catch (e) {
    console.error("updateDocumentActive error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const { PolicyDocument, PolicyChunk } = req.app.locals.models;
    const { id } = req.params;

    const doc = await PolicyDocument.findByPk(id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete chunks first
    await PolicyChunk.destroy({ where: { document_id: id } });

    // Delete document
    await doc.destroy();

    return res.json({ ok: true, message: "Document deleted" });
  } catch (e) {
    console.error("deleteDocument error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.reindexDocument = async (req, res) => {
  try {
    const { PolicyDocument, PolicyChunk, sequelize } = req.app.locals.models;
    const { id: documentId } = req.params; // Use :id instead of :documentId
    const { forceExtract = false } = req.body;

    const doc = await PolicyDocument.findByPk(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    let text = (doc.raw_text || "").trim();

    if ((!text || forceExtract) && doc.file_path && String(doc.file_mime || "").includes("pdf")) {
      text = await extractTextFromPdf(doc.file_path);
      if (text) await doc.update({ raw_text: text, updated_at: new Date() });
    }

    if (!text) {
      return res.status(400).json({ message: "No text available to index (upload rawText or PDF extract)." });
    }

    // delete existing chunks
    await PolicyChunk.destroy({ where: { document_id: doc.id } });

    const size = parseInt(process.env.POLICY_CHUNK_SIZE || "900", 10);
    const overlap = parseInt(process.env.POLICY_CHUNK_OVERLAP || "150", 10);
    const parts = chunkText(text, size, overlap);

    const created = await PolicyChunk.bulkCreate(
      parts.map((content, i) => ({
        tenant_id: doc.tenant_id,
        site_id: doc.site_id,
        document_id: doc.id,
        chunk_index: i,
        content,
      })),
      { returning: true }
    );

    // embeddings
    if (envBool("POLICY_AUTO_EMBED", true)) {
      for (const row of created) {
        const vec = await embedOne(row.content);
        if (vec) {
          await PolicyChunk.update({ embedding_json: vec }, { where: { id: row.id } });
          try {
            await sequelize.query(`UPDATE policy_chunks SET embedding = :vec WHERE id = :id`, {
              replacements: { vec: `[${vec.join(",")}]`, id: row.id },
            });
          } catch (_) {}
        }
      }
    }

    return res.json({ ok: true, chunksCreated: created.length });
  } catch (e) {
    console.error("reindexDocument error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// USER: ask policy (guard/supervisor/admin) — cite-or-refuse
exports.askPolicy = async (req, res) => {
  try {
    const { AIPolicyQA } = req.app.locals.models;
    const role = roleFromReq(req);
    const userId = userIdFromReq(req);

const { siteId = null, shiftId = null, question } = req.body;

// ✅ Prefer auth context (guard/admin JWT) over client input
let tenantId = req.user?.tenant_id || req.body.tenantId;

if (!question) {
  return res.status(400).json({ message: "question is required" });
}

if (!userId) {
  return res.status(400).json({ message: "User authentication required. Please log in again." });
}

if (!tenantId) {
  // Try to get tenant_id from guard record in database
  try {
    const { Guard } = req.app.locals.models;
    const guard = await Guard.findByPk(userId);
    if (guard?.tenant_id) {
      // Use guard's tenant_id from database
      tenantId = guard.tenant_id;
      // Update req.user for consistency
      req.user = { ...req.user, tenant_id: tenantId };
    } else {
      return res.status(400).json({ 
        message: "tenantId is required. Guard account must be associated with a tenant.",
        hint: "Please contact admin to assign tenant to your account."
      });
    }
  } catch (err) {
    return res.status(400).json({ 
      message: "Unable to determine tenant. Please contact admin.",
      error: err.message 
    });
  }
}

    const chunks = await retrievePolicyChunks({
      models: req.app.locals.models,
      tenantId,
      siteId,
      role,
      query: question,
      limit: 6,
    });

    if (!chunks.length) {
      const answer =
        "I can’t find this in the current policy sources for your site/tenant. Please ask a supervisor.";
      const qa = await AIPolicyQA.create({
        tenant_id: tenantId,
        site_id: siteId,
        shift_id: shiftId,
        asked_by_user_id: userId,
        asked_by_role: role,
        question,
        answer,
        sources_json: [],
        escalate_recommended: true,
        confidence: 0.2,
      });

      const io = req.app.get("io");
      io?.to("supervisor")?.emit?.("policy_question_unanswered", {
        qaId: qa.id,
        tenantId,
        siteId,
        shiftId,
        role,
        userId,
        question,
      });

      return res.json({
        ok: true,
        answer,
        citations: [],
        escalateRecommended: true,
        qaId: qa.id,
      });
    }

    const { answer, citations } = buildSafeAnswer(question, chunks);

    const qa = await AIPolicyQA.create({
      tenant_id: tenantId,
      site_id: siteId,
      shift_id: shiftId,
      asked_by_user_id: userId,
      asked_by_role: role,
      question,
      answer,
      sources_json: citations,
      escalate_recommended: false,
      confidence: 0.7,
    });

    const io = req.app.get("io");
    io?.to("admin")?.emit?.("policy_question_answered", {
      qaId: qa.id,
      tenantId,
      siteId,
      shiftId,
      role,
      userId,
      question,
      citationsCount: citations.length,
    });

    return res.json({
      ok: true,
      answer,
      citations,
      escalateRecommended: false,
      qaId: qa.id,
    });
  } catch (e) {
    console.error("askPolicy error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
