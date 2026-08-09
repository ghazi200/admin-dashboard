/**
 * Non-blocking audit emit + query helpers.
 */
function actorFromAdmin(admin) {
  if (!admin) return { actorType: "system", actorId: null };
  return {
    actorType: "admin",
    actorId: admin.id != null ? String(admin.id) : null,
  };
}

/**
 * @param {import('express').Application|null} app
 * @param {object} payload
 */
async function emitAuditEvent(app, payload = {}) {
  try {
    const models = app?.locals?.models || payload.models;
    const AuditEvent = models?.AuditEvent;
    if (!AuditEvent) return null;

    const {
      tenantId = null,
      actorType = "system",
      actorId = null,
      action,
      entityType = null,
      entityId = null,
      summary = null,
      before = null,
      after = null,
      meta = null,
    } = payload;

    if (!action) return null;

    const row = await AuditEvent.create({
      tenant_id: tenantId || null,
      actor_type: String(actorType || "system").slice(0, 32),
      actor_id: actorId != null ? String(actorId).slice(0, 64) : null,
      action: String(action).slice(0, 128),
      entity_type: entityType != null ? String(entityType).slice(0, 64) : null,
      entity_id: entityId || null,
      summary: summary != null ? String(summary).slice(0, 2000) : null,
      before_json: before ?? null,
      after_json: after ?? null,
      meta: meta && typeof meta === "object" ? meta : {},
      created_at: new Date(),
    });
    return row;
  } catch (e) {
    console.warn("emitAuditEvent failed:", e?.message || e);
    return null;
  }
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  const header = [
    "created_at",
    "tenant_id",
    "actor_type",
    "actor_id",
    "action",
    "entity_type",
    "entity_id",
    "summary",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.created_at,
        r.tenant_id,
        r.actor_type,
        r.actor_id,
        r.action,
        r.entity_type,
        r.entity_id,
        r.summary,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

module.exports = {
  emitAuditEvent,
  actorFromAdmin,
  csvEscape,
  rowsToCsv,
};
