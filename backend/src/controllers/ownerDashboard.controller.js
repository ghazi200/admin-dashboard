/**
 * Owner Dashboard API
 * Company/tenant-level summary for owners (and tenant admins).
 * GET /api/admin/owner-dashboard/summary — total locations, guards, incidents, cost by location, supervisor per location
 */
const { Op } = require("sequelize");
const { getTenantFilter } = require("../utils/tenantFilter");

/**
 * GET /api/admin/owner-dashboard/summary
 * Returns aggregated metrics for the admin's tenant. Accessible to admin, supervisor, and owner roles (tenant-scoped).
 */
exports.getSummary = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    const models = req.app?.locals?.models;
    if (!models) {
      return res.status(500).json({ message: "Models not available" });
    }

    const { Site, Guard, Incident, Tenant, Admin, Staff, sequelize } = models;

    // Tenant filter: super_admin sees nothing (or we could return all tenants); non–super_admin must have tenant_id
    if (!tenantId) {
      return res.json({
        totalLocations: 0,
        totalGuards: 0,
        totalSupervisors: 0,
        totalIncidents: 0,
        costByLocation: [],
        supervisorsByLocation: [],
        staffList: [],
        subscription: null,
        message: "No tenant context. Sign in as a tenant admin or owner.",
      });
    }

    // Subscription / plan for this tenant (same fields as Super Admin)
    let subscription = null;
    try {
      const tenant = await Tenant.findByPk(tenantId, {
        attributes: ["subscription_plan", "status", "trial_ends_at", "max_guards", "max_locations", "features", "monthly_amount"],
        raw: true,
      });
      if (tenant) {
        subscription = {
          subscription_plan: tenant.subscription_plan || "free",
          status: tenant.status || "active",
          trial_ends_at: tenant.trial_ends_at,
          max_guards: tenant.max_guards,
          max_locations: tenant.max_locations,
          features: tenant.features || {},
          monthly_amount: tenant.monthly_amount != null ? Number(tenant.monthly_amount) : null,
        };
      }
    } catch (e) {
      // non-fatal; summary still returns without subscription
    }

    const tenantWhere = { [Op.or]: [{ tenant_id: tenantId }, { tenant_id: null }] };
    const tenantOnly = { tenant_id: tenantId };

    // Total locations (sites) for this tenant
    const totalLocations = await Site.count({ where: tenantWhere });

    // Total guards for this tenant
    const totalGuards = await Guard.count({ where: tenantOnly });

    // Total incidents for this tenant
    const totalIncidents = await Incident.count({ where: tenantOnly });

    // Total supervisors (admins with role supervisor) for this tenant
    let totalSupervisors = 0;
    if (models.Admin) {
      totalSupervisors = await Admin.count({
        where: { tenant_id: tenantId, role: "supervisor" },
      });
    }

    // Cost by location: shifts (CLOSED) grouped by location; estimate 8 hrs × pay_rate (or $15 default)
    let costByLocation = [];
    try {
      const rows = await sequelize.query(
        `SELECT 
          s.location AS location_name,
          COUNT(s.id) AS shift_count,
          COALESCE(SUM(8 * COALESCE(
            NULLIF(TRIM(COALESCE(g.pay_rate::text, '')), '')::numeric,
            15
          )), 0) AS estimated_cost
        FROM shifts s
        LEFT JOIN guards g ON g.id = s.guard_id
        WHERE s.tenant_id = :tenantId AND s.status = 'CLOSED'
        GROUP BY s.location
        ORDER BY estimated_cost DESC`,
        { replacements: { tenantId }, type: sequelize.QueryTypes.SELECT }
      );
      costByLocation = (Array.isArray(rows) ? rows : []).map((r) => ({
        locationName: r.location_name || "Unspecified",
        shiftCount: Number(r.shift_count) || 0,
        estimatedCost: Math.round(Number(r.estimated_cost) || 0),
      }));
    } catch (e) {
      const simpleRows = await sequelize.query(
        `SELECT location AS location_name, COUNT(*) AS shift_count
         FROM shifts WHERE tenant_id = :tenantId AND status = 'CLOSED'
         GROUP BY location`,
        { replacements: { tenantId }, type: sequelize.QueryTypes.SELECT }
      );
      costByLocation = (Array.isArray(simpleRows) ? simpleRows : []).map((r) => ({
        locationName: r.location_name || "Unspecified",
        shiftCount: Number(r.shift_count) || 0,
        estimatedCost: (Number(r.shift_count) || 0) * 8 * 15,
      }));
    }

    // Supervisors by location: sites with optional supervisor (no supervisor_id on sites yet — placeholder)
    const sites = await Site.findAll({
      where: tenantWhere,
      order: [["name", "ASC"]],
      attributes: ["id", "name"],
    });
    const supervisorsByLocation = (sites || []).map((s) => ({
      siteId: s.id,
      siteName: s.name || "—",
      supervisorName: "—",
    }));

    // Staff directory: name, title, contact (admin-managed, owner views)
    let staffList = [];
    if (Staff) {
      const staffRows = await Staff.findAll({
        where: { tenant_id: tenantId },
        order: [["name", "ASC"]],
        attributes: ["id", "name", "title", "contact"],
        raw: true,
      });
      staffList = (staffRows || []).map((r) => ({
        id: r.id,
        name: r.name || "—",
        title: r.title || "—",
        contact: r.contact || "—",
      }));
    }

    return res.json({
      totalLocations,
      totalGuards,
      totalSupervisors,
      totalIncidents,
      costByLocation,
      supervisorsByLocation,
      staffList,
      subscription,
    });
  } catch (e) {
    console.error("owner-dashboard getSummary error:", e);
    return res.status(500).json({ message: "Failed to load owner summary", error: e.message });
  }
};

/**
 * GET /api/admin/owner-dashboard/staff
 * List staff directory for the admin's tenant (for admin management page).
 */
exports.listStaff = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({ message: "Tenant context required" });
    }
    const Staff = req.app?.locals?.models?.Staff;
    if (!Staff) {
      return res.json({ data: [] });
    }
    const rows = await Staff.findAll({
      where: { tenant_id: tenantId },
      order: [["name", "ASC"]],
      attributes: ["id", "name", "title", "contact"],
      raw: true,
    });
    return res.json({ data: rows || [] });
  } catch (e) {
    console.error("owner-dashboard listStaff error:", e);
    return res.status(500).json({ message: "Failed to list staff", error: e.message });
  }
};

/**
 * POST /api/admin/owner-dashboard/staff
 * Create a staff entry (name, title, contact). Tenant scoped.
 */
exports.createStaff = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({ message: "Tenant context required" });
    }
    const Staff = req.app?.locals?.models?.Staff;
    if (!Staff) {
      return res.status(500).json({ message: "Staff model not available" });
    }
    const { name, title, contact } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    const staff = await Staff.create({
      tenant_id: tenantId,
      name: String(name).trim(),
      title: title != null ? String(title).trim() : null,
      contact: contact != null ? String(contact).trim() : null,
    });
    return res.status(201).json({
      data: {
        id: staff.id,
        name: staff.name,
        title: staff.title || "—",
        contact: staff.contact || "—",
      },
    });
  } catch (e) {
    console.error("owner-dashboard createStaff error:", e);
    return res.status(500).json({ message: "Failed to create staff", error: e.message });
  }
};

/**
 * PUT /api/admin/owner-dashboard/staff/:id
 * Update a staff entry.
 */
exports.updateStaff = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({ message: "Tenant context required" });
    }
    const Staff = req.app?.locals?.models?.Staff;
    if (!Staff) {
      return res.status(500).json({ message: "Staff model not available" });
    }
    const id = (req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ message: "Staff id is required" });
    }
    const staff = await Staff.findOne({ where: { id, tenant_id: tenantId } });
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }
    const { name, title, contact } = req.body || {};
    if (name !== undefined) staff.name = String(name).trim();
    if (title !== undefined) staff.title = title == null ? null : String(title).trim();
    if (contact !== undefined) staff.contact = contact == null ? null : String(contact).trim();
    await staff.save();
    return res.json({
      data: {
        id: staff.id,
        name: staff.name,
        title: staff.title || "—",
        contact: staff.contact || "—",
      },
    });
  } catch (e) {
    console.error("owner-dashboard updateStaff error:", e);
    return res.status(500).json({ message: "Failed to update staff", error: e.message });
  }
};

/**
 * DELETE /api/admin/owner-dashboard/staff/:id
 */
exports.deleteStaff = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({ message: "Tenant context required" });
    }
    const Staff = req.app?.locals?.models?.Staff;
    if (!Staff) {
      return res.status(500).json({ message: "Staff model not available" });
    }
    const id = (req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ message: "Staff id is required" });
    }
    const deleted = await Staff.destroy({ where: { id, tenant_id: tenantId } });
    if (!deleted) {
      return res.status(404).json({ message: "Staff not found" });
    }
    return res.status(204).send();
  } catch (e) {
    console.error("owner-dashboard deleteStaff error:", e);
    return res.status(500).json({ message: "Failed to delete staff", error: e.message });
  }
};
