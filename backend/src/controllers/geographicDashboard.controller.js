/**
 * Geographic Dashboard API
 * Uses same database as rest of admin backend (abe_guard via backend/.env DATABASE_URL).
 * GET /api/admin/geographic/sites — list sites (tenant-filtered; tenant admins also see global sites)
 * POST /api/admin/geographic/sites — create site
 * POST /api/admin/geographic/route-optimize — optimize visit order for selected sites
 * GET /api/admin/geographic/analytics — geographic analytics (counts, bbox, distances)
 */
const { Op } = require("sequelize");
const { getTenantFilter, ensureTenantId } = require("../utils/tenantFilter");
const { optimizeRoute } = require("../services/routeOptimization.service");
const { computeAnalytics } = require("../services/geographicAnalytics.service");

function toSiteDto(row) {
  try {
    const r = row && typeof row.toJSON === "function" ? row.toJSON() : row || {};
    const lat = r.latitude != null && r.latitude !== "" ? parseFloat(r.latitude) : null;
    const lng = r.longitude != null && r.longitude !== "" ? parseFloat(r.longitude) : null;
    const addr1 = r.address_1 != null ? String(r.address_1).trim() : "";
    const addr2 = r.address_2 != null ? String(r.address_2).trim() : "";
    const address = [addr1, addr2].filter(Boolean).join(", ") || null;
    const addressLines = [addr1, addr2].filter(Boolean);
    return {
      id: r.id != null ? String(r.id) : r.id,
      name: r.name || "",
      address,
      addressLines,
      latitude: Number.isNaN(lat) ? null : lat,
      longitude: Number.isNaN(lng) ? null : lng,
      tenant_id: r.tenant_id || null,
    };
  } catch (e) {
    return null;
  }
}

exports.getSites = async (req, res) => {
  try {
    const models = req.app && req.app.locals && req.app.locals.models;
    if (!models) {
      console.error("getSites: req.app.locals.models not set");
      return res.json({ data: [] });
    }
    const Site = models.Site;
    if (!Site) {
      console.error("getSites: Site model not on app.locals.models");
      return res.json({ data: [] });
    }
    const tenantId = getTenantFilter(req.admin);

    // Build where: super_admin sees all; tenant admin sees their tenant OR global (tenant_id IS NULL)
    let where = {};
    if (tenantId != null) {
      where = { [Op.or]: [{ tenant_id: tenantId }, { tenant_id: null }] };
    }

    let sites = await Site.findAll({
      where,
      order: [["name", "ASC"]],
      attributes: ["id", "name", "address_1", "address_2", "latitude", "longitude", "tenant_id"],
    });

    // If Sequelize returns nothing, try raw query (handles schema quirks, e.g. column names)
    if (!Array.isArray(sites) || sites.length === 0) {
      const { sequelize } = models;
      let sql = "SELECT id, name, address_1, address_2, latitude, longitude, tenant_id FROM sites WHERE 1=1";
      const bind = [];
      if (tenantId != null) {
        sql += " AND (tenant_id = $1 OR tenant_id IS NULL)";
        bind.push(tenantId);
      }
      sql += " ORDER BY name ASC";
      const [rawRows] = await sequelize.query(sql, { bind });
      if (Array.isArray(rawRows) && rawRows.length > 0) {
        sites = rawRows;
      }
    }

    const list = (Array.isArray(sites) ? sites : []).map(toSiteDto).filter(Boolean);
    if (process.env.NODE_ENV !== "production") {
      if (process.env.DEBUG_DASHBOARD) console.log("[geographic/getSites] role=%s tenantId=%s list.length=%d", req.admin?.role, tenantId ?? "null", list.length);
    }
    return res.json({ data: list });
  } catch (e) {
    console.error("getSites error:", e.message, e.original?.code || "", e.stack || "");
    if (!res.headersSent) return res.json({ data: [] });
  }
};

/**
 * DELETE /api/admin/geographic/sites/:siteId
 * Delete a site. Tenant-scoped: only sites belonging to the admin's tenant (or global) can be deleted.
 */
exports.deleteSite = async (req, res) => {
  try {
    const siteIdParam = (req.params.siteId || "").trim();
    if (!siteIdParam) {
      return res.status(400).json({ message: "siteId is required" });
    }
    const { Site } = req.app.locals.models;
    if (!Site) {
      return res.status(500).json({ message: "Models not available" });
    }
    const site = await Site.findOne({
      where: { id: siteIdParam },
      attributes: ["id", "tenant_id"],
    });
    if (!site) {
      return res.status(404).json({ message: "Site not found." });
    }
    const siteRow = site && typeof site.toJSON === "function" ? site.toJSON() : site;
    const siteTenantId = siteRow?.tenant_id ?? null;
    if (!canAccessSite(req.admin, siteTenantId)) {
      return res.status(403).json({ message: "You don't have access to delete this site." });
    }
    await Site.destroy({ where: { id: siteIdParam } });
    return res.status(204).send();
  } catch (e) {
    console.error("deleteSite error:", e);
    return res.status(500).json({ message: e.message || "Failed to delete site" });
  }
};

exports.createSite = async (req, res) => {
  try {
    const { Site } = req.app.locals.models;
    const { name, address, address_1, address_2, latitude, longitude } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const addr = address != null ? String(address).trim() || null : null;
    const payload = {
      name: name.trim(),
      address_1: address_1 != null ? String(address_1).trim() || null : addr,
      address_2: address_2 != null ? String(address_2).trim() || null : null,
      latitude: latitude != null && latitude !== "" ? parseFloat(latitude) : null,
      longitude: longitude != null && longitude !== "" ? parseFloat(longitude) : null,
    };
    if (Number.isNaN(payload.latitude)) payload.latitude = null;
    if (Number.isNaN(payload.longitude)) payload.longitude = null;
    const withTenant = ensureTenantId(req.admin, payload);
    const site = await Site.create(withTenant);
    return res.status(201).json({ data: toSiteDto(site) });
  } catch (e) {
    console.error("createSite error:", e);
    return res.status(500).json({ message: e.message || "Failed to create site" });
  }
};

/**
 * Load sites for current tenant (same logic as getSites). Returns array of DTOs.
 */
async function loadSitesForTenant(req) {
  const models = req.app?.locals?.models;
  if (!models?.Site) return [];
  const tenantId = getTenantFilter(req.admin);
  let where = {};
  if (tenantId != null) {
    where = { [Op.or]: [{ tenant_id: tenantId }, { tenant_id: null }] };
  }
  const sites = await models.Site.findAll({
    where,
    order: [["name", "ASC"]],
    attributes: ["id", "name", "address_1", "address_2", "latitude", "longitude", "tenant_id"],
  });
  const list = (Array.isArray(sites) ? sites : []).map(toSiteDto).filter(Boolean);
  return list;
}

exports.getRouteOptimize = async (req, res) => {
  try {
    let siteIds = req.body?.siteIds;
    if (siteIds == null && req.query?.siteIds) {
      siteIds = req.query.siteIds.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(siteIds)) siteIds = [];
    console.log("[route-optimize] received siteIds=%d", siteIds.length);

    let origin = req.body?.origin ?? null;
    if (origin == null && req.query?.origin) {
      try {
        const o = JSON.parse(decodeURIComponent(req.query.origin));
        if (o && (typeof o.lat === "number" || typeof o.lat === "string") && (typeof o.lng === "number" || typeof o.lng === "string")) {
          origin = { lat: Number(o.lat), lng: Number(o.lng) };
        }
      } catch (_) {}
    }

    const sites = await loadSitesForTenant(req);
    const result = optimizeRoute(sites, siteIds, origin);
    const data = {
      orderedSites: result.orderedSites,
      legs: result.legs,
      totalDistanceKm: result.totalDistanceKm,
    };
    if (siteIds.length >= 2 && result.orderedSites.length === 0) {
      data.message = "No matching sites found. Ensure the selected sites have coordinates and belong to your tenant.";
      if (process.env.NODE_ENV !== "production") {
        const norm = (id) => String(id).trim().toLowerCase();
        const requested = new Set((siteIds || []).map(norm));
        const available = (sites || []).map((s) => norm(s.id));
        const matchCount = available.filter((id) => requested.has(id)).length;
        console.log("[route-optimize] requested=%d sites=%d matched=%d sampleRequested=%j sampleAvailable=%j",
          siteIds.length, sites.length, matchCount,
          (siteIds || []).slice(0, 3),
          available.slice(0, 5));
      }
    }
    return res.json({ data });
  } catch (e) {
    console.error("getRouteOptimize error:", e.message, e.stack);
    return res.status(500).json({ message: e.message || "Route optimization failed" });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const sites = await loadSitesForTenant(req);
    const analytics = computeAnalytics(sites);
    return res.json({ data: analytics });
  } catch (e) {
    console.error("getAnalytics error:", e.message);
    return res.status(500).json({ message: e.message || "Analytics failed" });
  }
};

/**
 * GET /api/admin/geographic/sites/:siteId/details
 * Returns site info plus staff count, supervisor (placeholder), and guards (name, email, phone).
 * Staff = distinct guards who have shifts at this location (shift.location matches site.name).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canAccessSite(admin, siteTenantId) {
  if (admin?.role === "super_admin") return true;
  if (siteTenantId == null) return true; // global site visible to all authenticated users
  return (admin?.tenant_id || null) === siteTenantId;
}

exports.getSiteDetails = async (req, res) => {
  try {
    const siteIdParam = (req.params.siteId || "").trim();
    if (!siteIdParam) {
      return res.status(400).json({ message: "siteId is required" });
    }
    const models = req.app?.locals?.models;
    if (!models?.Site || !models?.Shift || !models?.Guard) {
      return res.status(500).json({ message: "Models not available" });
    }
    const tenantId = getTenantFilter(req.admin);

    const Site = models.Site;
    const Shift = models.Shift;
    const Guard = models.Guard;

    let site = null;
    if (UUID_REGEX.test(siteIdParam)) {
      site = await Site.findOne({
        where: { id: siteIdParam },
        attributes: ["id", "name", "address_1", "address_2", "latitude", "longitude", "tenant_id"],
      });
    }
    if (!site) {
      const byNameOrAddress = {
        [Op.or]: [
          { name: { [Op.iLike]: siteIdParam } },
          { address_1: { [Op.iLike]: siteIdParam } },
          { address_2: { [Op.iLike]: siteIdParam } },
        ],
      };
      const fallbackWhere = tenantId != null
        ? { [Op.and]: [byNameOrAddress, { [Op.or]: [{ tenant_id: tenantId }, { tenant_id: null }] }] }
        : byNameOrAddress;
      site = await Site.findOne({
        where: fallbackWhere,
        attributes: ["id", "name", "address_1", "address_2", "latitude", "longitude", "tenant_id"],
      });
    }
    if (!site) {
      return res.status(404).json({ message: "Site not found or you don't have access." });
    }
    const siteRow = site && typeof site.toJSON === "function" ? site.toJSON() : site;
    const siteTenantId = siteRow?.tenant_id ?? null;
    if (!canAccessSite(req.admin, siteTenantId)) {
      return res.status(403).json({ message: "You don't have access to this site." });
    }
    const siteName = (siteRow?.name ?? "").trim();
    const addr1 = siteRow?.address_1 != null ? String(siteRow.address_1).trim() : "";
    const addr2 = siteRow?.address_2 != null ? String(siteRow.address_2).trim() : "";
    const address = [addr1, addr2].filter(Boolean).join(", ") || null;

    const shiftWhere = { location: { [Op.iLike]: siteName } };
    if (tenantId != null) {
      shiftWhere.tenant_id = tenantId;
    }
    const shifts = await Shift.findAll({
      where: shiftWhere,
      attributes: ["guard_id"],
      raw: true,
    });
    const guardIds = [...new Set((shifts || []).map((s) => s.guard_id).filter(Boolean))];
    let guards = [];
    if (guardIds.length > 0) {
      const guardList = await Guard.findAll({
        where: { id: { [Op.in]: guardIds } },
        attributes: ["id", "name", "email", "phone"],
        raw: true,
      });
      guards = (guardList || []).map((g) => ({
        id: g.id,
        name: g.name ?? "—",
        email: g.email ?? "—",
        phone: g.phone ?? "—",
      }));
    }

    return res.json({
      data: {
        siteId: siteRow?.id,
        siteName,
        address,
        staffCount: guards.length,
        supervisorName: "—",
        guards,
      },
    });
  } catch (e) {
    console.error("getSiteDetails error:", e.message, e.stack);
    return res.status(500).json({ message: e.message || "Failed to load site details" });
  }
};
