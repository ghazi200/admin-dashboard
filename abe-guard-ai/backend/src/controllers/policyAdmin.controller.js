// backend/src/controllers/policyAdmin.controller.js
exports.listDocuments = async (req, res) => {
  try {
    const { PolicyDocument } = req.app.locals.models;
    const { tenantId, siteId } = req.query;
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" });

    const rows = await PolicyDocument.findAll({
      where: {
        tenant_id: tenantId,
        ...(siteId ? { site_id: siteId } : {}),
      },
      order: [["created_at", "DESC"]],
      limit: 200,
    });

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("listDocuments error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const { PolicyDocument, PolicyChunk } = req.app.locals.models;
    const { documentId } = req.params;

    const doc = await PolicyDocument.findByPk(documentId);
    if (!doc) return res.status(404).json({ message: "Not found" });

    const chunkCount = await PolicyChunk.count({ where: { document_id: doc.id } });

    return res.json({
      ok: true,
      document: doc,
      chunkCount,
    });
  } catch (e) {
    console.error("getDocument error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.setActive = async (req, res) => {
  try {
    const { PolicyDocument } = req.app.locals.models;
    const { documentId } = req.params;
    const { isActive } = req.body;

    const doc = await PolicyDocument.findByPk(documentId);
    if (!doc) return res.status(404).json({ message: "Not found" });

    await doc.update({ is_active: Boolean(isActive), updated_at: new Date() });
    return res.json({ ok: true, document: doc });
  } catch (e) {
    console.error("setActive error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const fs = require("fs");
    const { PolicyDocument, PolicyChunk } = req.app.locals.models;
    const { documentId } = req.params;

    const doc = await PolicyDocument.findByPk(documentId);
    if (!doc) return res.status(404).json({ message: "Not found" });

    await PolicyChunk.destroy({ where: { document_id: doc.id } });
    await PolicyDocument.destroy({ where: { id: doc.id } });

    if (doc.file_path) {
      try {
        fs.unlinkSync(doc.file_path);
      } catch (_) {}
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("deleteDocument error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
