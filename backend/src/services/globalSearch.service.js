/**
 * Advanced Search & Filters (UPGRADE_OPTIONS #31)
 * - Global search across guards, shifts, sites, tenants, incidents
 * - Tenant-scoped; supports entity type filters and date/status filters
 * - Snippets suitable for highlighting on the frontend
 */

const { Op } = require("sequelize");

const ENTITY_TYPES = ["guard", "shift", "site", "tenant", "incident"];
const DEFAULT_LIMIT_PER_TYPE = 5;
const DEFAULT_TOTAL_LIMIT = 25;
const MAX_HISTORY_PER_ADMIN = 10;

// In-memory search history: adminId -> [{ query, filters, ts }]
const searchHistoryByAdmin = new Map();

function buildWhere(tenantId, isSuperAdmin, query, entityType, filters = {}) {
  const tenantWhere = !isSuperAdmin && tenantId ? { tenant_id: tenantId } : {};
  const q = (query || "").trim();
  const hasQuery = q.length >= 2;
  const like = hasQuery ? { [Op.iLike]: `%${q.replace(/%/g, "\\%")}%` } : null;

  if (entityType === "guard") {
    const where = { ...tenantWhere };
    if (hasQuery) {
      where[Op.or] = [
        { name: like },
        { email: like },
        ...(q.replace(/\s/g, "").length >= 2 ? [{ phone: like }] : []),
      ];
    }
    if (filters.active !== undefined) where.active = !!filters.active;
    return where;
  }

  if (entityType === "shift") {
    const where = { ...tenantWhere };
    if (hasQuery) {
      where[Op.or] = [{ location: like }, { notes: like }];
    }
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom) where.shift_date = { ...(where.shift_date || {}), [Op.gte]: filters.dateFrom };
    if (filters.dateTo) where.shift_date = { ...(where.shift_date || {}), [Op.lte]: filters.dateTo };
    return where;
  }

  if (entityType === "site") {
    const where = { ...tenantWhere };
    if (hasQuery) {
      where[Op.or] = [{ name: like }, { address_1: like }, { address_2: like }];
    }
    return where;
  }

  if (entityType === "tenant") {
    const where = {};
    if (hasQuery) where.name = like;
    if (filters.status) where.status = filters.status;
    return where;
  }

  if (entityType === "incident") {
    const where = { ...tenantWhere };
    if (hasQuery) {
      where[Op.or] = [
        { title: like },
        { description: like },
        { locationText: like },
        { aiSummary: like },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom) where.occurredAt = { ...(where.occurredAt || {}), [Op.gte]: filters.dateFrom };
    if (filters.dateTo) where.occurredAt = { ...(where.occurredAt || {}), [Op.lte]: filters.dateTo };
    return where;
  }

  return tenantWhere;
}

function makeSnippet(text, query, maxLen = 120) {
  if (!text || typeof text !== "string") return "";
  const t = text.trim();
  if (!t) return "";
  const q = (query || "").trim().toLowerCase();
  let out = t.length <= maxLen ? t : t.slice(0, maxLen) + "…";
  if (q && out.toLowerCase().includes(q)) {
    const i = out.toLowerCase().indexOf(q);
    const start = Math.max(0, i - 30);
    out = (start > 0 ? "…" : "") + out.slice(start, start + maxLen) + (start + maxLen < t.length ? "…" : "");
  }
  return out;
}

/**
 * Run global search across selected entity types
 * @param {Object} params
 * @param {string} params.query - Search string
 * @param {string|null} params.tenantId - Admin's tenant (null for super_admin)
 * @param {boolean} params.isSuperAdmin
 * @param {string[]} [params.entityTypes] - Default all
 * @param {Object} [params.filters] - dateFrom, dateTo, status, active
 * @param {number} [params.limitPerType]
 * @param {number} [params.totalLimit]
 * @param {Object} models - Sequelize models
 */
async function search(params, models) {
  const {
    query = "",
    tenantId,
    isSuperAdmin = false,
    entityTypes = ENTITY_TYPES,
    filters = {},
    limitPerType = DEFAULT_LIMIT_PER_TYPE,
    totalLimit = DEFAULT_TOTAL_LIMIT,
  } = params;
  const { Guard, Shift, Site, Tenant, Incident } = models;
  const results = [];
  const q = query.trim();

  const types = Array.isArray(entityTypes)
    ? entityTypes.filter((t) => ENTITY_TYPES.includes(t.toLowerCase()))
    : ENTITY_TYPES;

  if (Guard && types.includes("guard")) {
    const where = buildWhere(tenantId, isSuperAdmin, q, "guard", filters);
    const rows = await Guard.findAll({
      where,
      attributes: ["id", "name", "email", "phone", "tenant_id"],
      limit: limitPerType,
    });
    rows.forEach((r) => {
      results.push({
        entityType: "guard",
        id: r.id,
        title: r.name || "Guard",
        snippet: makeSnippet([r.name, r.email, r.phone].filter(Boolean).join(" • "), q),
        href: "/guards",
        payload: { guardId: r.id },
      });
    });
  }

  if (Shift && types.includes("shift")) {
    const where = buildWhere(tenantId, isSuperAdmin, q, "shift", filters);
    const rows = await Shift.findAll({
      where,
      attributes: ["id", "shift_date", "shift_start", "shift_end", "location", "status", "tenant_id"],
      limit: limitPerType,
      order: [["shift_date", "DESC"], ["shift_start", "ASC"]],
    });
    rows.forEach((r) => {
      const title = [r.location, r.shift_date, r.shift_start].filter(Boolean).join(" • ") || r.id;
      results.push({
        entityType: "shift",
        id: r.id,
        title: title.length > 60 ? title.slice(0, 60) + "…" : title,
        snippet: makeSnippet(r.notes || r.location || r.shift_date, q),
        href: "/shifts",
        payload: { shiftId: r.id, date: r.shift_date },
      });
    });
  }

  if (Site && types.includes("site")) {
    const where = buildWhere(tenantId, isSuperAdmin, q, "site", filters);
    const rows = await Site.findAll({
      where,
      attributes: ["id", "name", "address_1", "address_2", "tenant_id"],
      limit: limitPerType,
    });
    rows.forEach((r) => {
      const title = r.name || r.address_1 || r.id;
      results.push({
        entityType: "site",
        id: r.id,
        title,
        snippet: makeSnippet([r.address_1, r.address_2].filter(Boolean).join(" "), q),
        href: "/map",
        payload: { siteId: r.id },
      });
    });
  }

  if (Tenant && types.includes("tenant") && isSuperAdmin) {
    const where = buildWhere(tenantId, true, q, "tenant", filters);
    const rows = await Tenant.findAll({
      where,
      attributes: ["id", "name", "status"],
      limit: limitPerType,
    });
    rows.forEach((r) => {
      results.push({
        entityType: "tenant",
        id: r.id,
        title: r.name || "Tenant",
        snippet: makeSnippet(r.name, q),
        href: "/super-admin/manage",
        payload: { tenantId: r.id },
      });
    });
  }

  if (Incident && types.includes("incident")) {
    const whereIncident = buildWhere(tenantId, isSuperAdmin, q, "incident", filters);
    if (whereIncident.tenant_id !== undefined) {
      whereIncident.tenantId = whereIncident.tenant_id;
      delete whereIncident.tenant_id;
    }
    const rows = await Incident.findAll({
      where: whereIncident,
      attributes: ["id", "title", "description", "status", "occurred_at", "tenant_id"],
      limit: limitPerType,
      order: [["occurred_at", "DESC"]],
    });
    rows.forEach((r) => {
      results.push({
        entityType: "incident",
        id: r.id,
        title: (r.title || "Incident").slice(0, 80),
        snippet: makeSnippet(r.description || r.title, q),
        href: "/incidents",
        payload: { incidentId: r.id },
      });
    });
  }

  const trimmed = results.slice(0, totalLimit);
  const totalByType = trimmed.reduce((acc, r) => {
    acc[r.entityType] = (acc[r.entityType] || 0) + 1;
    return acc;
  }, {});

  return {
    results: trimmed,
    totalByType,
    query: q,
  };
}

/**
 * Add a query to admin's search history (in-memory)
 */
function addSearchHistory(adminId, query, filters = {}) {
  if (!adminId || !query || !query.trim()) return;
  let list = searchHistoryByAdmin.get(adminId) || [];
  list = [{ query: query.trim(), filters, ts: Date.now() }, ...list.filter((e) => e.query !== query.trim())].slice(
    0,
    MAX_HISTORY_PER_ADMIN
  );
  searchHistoryByAdmin.set(adminId, list);
}

/**
 * Get admin's search history
 */
function getSearchHistory(adminId) {
  if (!adminId) return [];
  return searchHistoryByAdmin.get(adminId) || [];
}

module.exports = {
  search,
  addSearchHistory,
  getSearchHistory,
  ENTITY_TYPES,
};
