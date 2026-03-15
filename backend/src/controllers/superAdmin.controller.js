const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

/**
 * GET /api/super-admin/tenants
 * List all tenants
 */
exports.listTenants = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    const [tenants] = await sequelize.query(`
      SELECT 
        t.*,
        COUNT(DISTINCT a.id) as admin_count,
        COUNT(DISTINCT g.id) as guard_count,
        COUNT(DISTINCT s.id) as shift_count
      FROM tenants t
      LEFT JOIN admins a ON a.tenant_id = t.id
      LEFT JOIN guards g ON g.tenant_id = t.id
      LEFT JOIN shifts s ON s.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);

    // Format monthly_amount as number
    const formattedTenants = (tenants || []).map(t => ({
      ...t,
      monthly_amount: t.monthly_amount ? parseFloat(t.monthly_amount) : 0,
    }));

    return res.json(formattedTenants);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("listTenants error:", msg);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return res.status(200).json([]);
    }
    return res.status(500).json({
      message: "Failed to list tenants",
      error: msg,
    });
  }
};

/**
 * POST /api/super-admin/tenants
 * Create a new tenant
 */
exports.createTenant = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const {
      name,
      domain,
      contact_email,
      contact_phone,
      subscription_plan,
      features,
      status,
      trial_ends_at,
      max_guards,
      max_locations,
      notes,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Tenant name is required" });
    }

    const tenantId = uuidv4();
    const defaultFeatures = {
      dashboard: true,
      analytics: false,
      ai_optimization: false,
      callout_prediction: false,
      report_builder: false,
      smart_notifications: false,
      scheduled_reports: false,
      multi_location: false,
      api_access: false,
      white_label: false,
      ...features, // Override with provided features
    };

    // Set trial end date if not provided (default: 30 days)
    let trialEndDate = trial_ends_at;
    if (!trialEndDate && status === "trial") {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      trialEndDate = trialEnd.toISOString();
    }

    const {
      location,
      monthly_amount,
    } = req.body;

    const [result] = await sequelize.query(`
      INSERT INTO tenants (
        id, name, domain, contact_email, contact_phone, location, monthly_amount,
        subscription_plan, features, status, trial_ends_at, max_guards, max_locations, notes,
        created_at, updated_at
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      RETURNING *
    `, {
      bind: [
        tenantId,
        name,
        domain || null,
        contact_email || null,
        contact_phone || null,
        location || null,
        monthly_amount || 0,
        subscription_plan || "free",
        JSON.stringify(defaultFeatures),
        status || "trial",
        trialEndDate,
        max_guards || null,
        max_locations || null,
        notes || null,
      ],
    });

    return res.status(201).json(result[0]);
  } catch (e) {
    console.error("createTenant error:", e);
    return res.status(500).json({
      message: "Failed to create tenant",
      error: e.message,
    });
  }
};

/**
 * PUT /api/super-admin/tenants/:id
 * Update a tenant
 */
exports.updateTenant = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const tenantId = req.params.id;
    const updates = req.body;

    // Check if tenant exists
    const [existing] = await sequelize.query(`
      SELECT * FROM tenants WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [tenantId],
    });

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    // Build update query
    const updateFields = [];
    const bindParams = [];
    let paramIndex = 1;

    const allowedFields = [
      "name",
      "domain",
      "contact_email",
      "contact_phone",
      "location",
      "monthly_amount",
      "subscription_plan",
      "features",
      "status",
      "trial_ends_at",
      "max_guards",
      "max_locations",
      "notes",
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === "features") {
          updateFields.push(`${field} = $${paramIndex}::jsonb`);
          bindParams.push(JSON.stringify(updates[field]));
        } else if (field === "monthly_amount") {
          updateFields.push(`${field} = $${paramIndex}::decimal`);
          bindParams.push(updates[field]);
        } else {
          updateFields.push(`${field} = $${paramIndex}`);
          bindParams.push(updates[field]);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    updateFields.push(`updated_at = NOW()`);
    bindParams.push(tenantId);

    const query = `
      UPDATE tenants
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    const [result] = await sequelize.query(query, {
      bind: bindParams,
    });

    return res.json(result[0]);
  } catch (e) {
    console.error("updateTenant error:", e);
    return res.status(500).json({
      message: "Failed to update tenant",
      error: e.message,
    });
  }
};

/**
 * DELETE /api/super-admin/tenants/:id
 * Delete a tenant (soft delete by setting status to inactive)
 */
exports.deleteTenant = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const tenantId = req.params.id;

    // Soft delete: set status to inactive
    const [result] = await sequelize.query(`
      UPDATE tenants
      SET status = 'inactive', updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id, name, status
    `, {
      bind: [tenantId],
    });

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Tenant not found" });
    }

    return res.json({
      message: "Tenant deactivated successfully",
      tenant: result[0],
    });
  } catch (e) {
    console.error("deleteTenant error:", e);
    return res.status(500).json({
      message: "Failed to delete tenant",
      error: e.message,
    });
  }
};

/**
 * POST /api/super-admin/tenants/:id/admins
 * Create an admin for a tenant
 */
exports.createTenantAdmin = async (req, res) => {
  try {
    const { sequelize, Admin } = req.app.locals.models;
    const tenantId = req.params.id;
    const { name, email, password, role, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      });
    }

    // Verify tenant exists
    const [tenant] = await sequelize.query(`
      SELECT id, name FROM tenants WHERE id = $1::uuid AND status != 'inactive' LIMIT 1
    `, {
      bind: [tenantId],
    });

    if (!tenant || tenant.length === 0) {
      return res.status(404).json({ message: "Tenant not found or inactive" });
    }

    // Check if email already exists
    const existing = await Admin.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create admin
    const admin = await Admin.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hash,
      role: role || "admin",
      permissions: permissions || [],
      tenant_id: tenantId,
    });

    return res.status(201).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tenant_id: admin.tenant_id,
      permissions: admin.permissions,
    });
  } catch (e) {
    console.error("createTenantAdmin error:", e);
    return res.status(500).json({
      message: "Failed to create tenant admin",
      error: e.message,
    });
  }
};

/**
 * GET /api/super-admin/tenants/:id/stats
 * Get tenant statistics
 */
exports.getTenantStats = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const tenantId = req.params.id;

    const [stats] = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM admins WHERE tenant_id = $1::uuid) as admin_count,
        (SELECT COUNT(*) FROM guards WHERE tenant_id = $1::uuid) as guard_count,
        (SELECT COUNT(*) FROM shifts WHERE tenant_id = $1::uuid) as shift_count,
        (SELECT COUNT(*) FROM shifts WHERE tenant_id = $1::uuid AND status = 'OPEN') as open_shifts,
        (SELECT COUNT(*) FROM callouts WHERE tenant_id = $1::uuid) as callout_count,
        (SELECT COUNT(*) FROM shifts WHERE tenant_id = $1::uuid AND status = 'CLOSED' AND shift_date >= CURRENT_DATE - INTERVAL '30 days') as shifts_last_30_days
    `, {
      bind: [tenantId],
    });

    return res.json(stats[0] || {});
  } catch (e) {
    console.error("getTenantStats error:", e);
    return res.status(500).json({
      message: "Failed to get tenant stats",
      error: e.message,
    });
  }
};

/**
 * GET /api/super-admin/analytics
 * Get cross-tenant analytics
 */
exports.getSuperAdminAnalytics = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    const [analytics] = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT t.id) as total_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END) as active_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'trial' THEN t.id END) as trial_tenants,
        COUNT(DISTINCT CASE WHEN t.status = 'suspended' THEN t.id END) as suspended_tenants,
        COUNT(DISTINCT a.id) as total_admins,
        COUNT(DISTINCT g.id) as total_guards,
        COUNT(DISTINCT s.id) as total_shifts,
        COUNT(DISTINCT CASE WHEN t.subscription_plan = 'enterprise' THEN t.id END) as enterprise_tenants,
        COUNT(DISTINCT CASE WHEN t.subscription_plan = 'pro' THEN t.id END) as pro_tenants,
        COUNT(DISTINCT CASE WHEN t.subscription_plan = 'basic' THEN t.id END) as basic_tenants,
        COUNT(DISTINCT CASE WHEN t.subscription_plan = 'free' THEN t.id END) as free_tenants,
        COALESCE(SUM(t.monthly_amount), 0) as total_monthly_revenue,
        COALESCE(AVG(t.monthly_amount), 0) as avg_monthly_revenue
      FROM tenants t
      LEFT JOIN admins a ON a.tenant_id = t.id
      LEFT JOIN guards g ON g.tenant_id = t.id
      LEFT JOIN shifts s ON s.tenant_id = t.id
      WHERE t.status != 'inactive'
    `);

    const result = analytics?.[0] || {};
    result.total_monthly_revenue = result.total_monthly_revenue ? parseFloat(result.total_monthly_revenue) : 0;
    result.avg_monthly_revenue = result.avg_monthly_revenue ? parseFloat(result.avg_monthly_revenue) : 0;

    return res.json(result);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("getSuperAdminAnalytics error:", msg);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return res.status(200).json({
        total_tenants: 0,
        active_tenants: 0,
        trial_tenants: 0,
        suspended_tenants: 0,
        total_admins: 0,
        total_guards: 0,
        total_shifts: 0,
        enterprise_tenants: 0,
        pro_tenants: 0,
        basic_tenants: 0,
        free_tenants: 0,
        total_monthly_revenue: 0,
        avg_monthly_revenue: 0,
        _message: "Tenants table not found. Run database migrations.",
      });
    }
    return res.status(500).json({
      message: "Failed to get analytics",
      error: msg,
    });
  }
};

/**
 * GET /api/super-admin/incidents
 * Get all incidents across all tenants with status breakdown
 */
exports.getSuperAdminIncidents = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    // Get incidents from incidents table (using extended schema)
    const incidentsResult = await sequelize.query(`
      SELECT 
        i.id,
        i.tenant_id,
        i.guard_id,
        i.shift_id,
        i.site_id,
        i.title,
        i.type,
        i.status,
        i.severity,
        i.description,
        i.occurred_at,
        i.reported_at,
        i.location_text,
        i.ai_summary,
        i.ai_tags_json,
        i.attachments_json,
        i.created_at,
        t.name as tenant_name,
        t.location as tenant_location
      FROM incidents i
      LEFT JOIN tenants t ON i.tenant_id = t.id
      ORDER BY i.reported_at DESC NULLS LAST, i.created_at DESC
      LIMIT 100
    `).catch(() => {
      // If incidents table doesn't exist, return empty array
      return [[], []];
    });

    // Sequelize returns [rows, metadata]
    // incidentsResult is [rows, metadata], so incidentsResult[0] is the rows array
    const incidentsList = incidentsResult && Array.isArray(incidentsResult[0]) 
      ? incidentsResult[0] 
      : [];

    // Get status breakdown
    const statusBreakdownResult = await sequelize.query(`
      SELECT 
        status,
        COUNT(*)::integer as count
      FROM incidents
      GROUP BY status
    `).catch(() => [[], []]);
    
    // Sequelize returns [rows, metadata]
    const statusBreakdown = Array.isArray(statusBreakdownResult[0]) ? statusBreakdownResult[0] : [];
    
    // Calculate total from status breakdown (more reliable than counting list)
    const totalFromBreakdown = statusBreakdown.reduce((sum, item) => sum + (parseInt(item.count) || 0), 0);
    const totalIncidents = totalFromBreakdown > 0 ? totalFromBreakdown : incidentsList.length;

    // Get incidents by tenant
    const byTenantResult = await sequelize.query(`
      SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        COUNT(i.id)::integer as incident_count,
        COUNT(CASE WHEN i.status = 'OPEN' THEN 1 END)::integer as open_count,
        COUNT(CASE WHEN i.status = 'RESOLVED' THEN 1 END)::integer as resolved_count,
        COUNT(CASE WHEN i.status = 'IN_PROGRESS' THEN 1 END)::integer as in_progress_count
      FROM tenants t
      LEFT JOIN incidents i ON i.tenant_id = t.id
      WHERE t.status != 'inactive'
      GROUP BY t.id, t.name
      ORDER BY incident_count DESC
    `).catch(() => [[], []]);

    // Sequelize returns [rows, metadata]
    const byTenant = Array.isArray(byTenantResult[0]) ? byTenantResult[0] : [];

    return res.json({
      incidents: incidentsList,
      statusBreakdown: statusBreakdown,
      byTenant: byTenant,
      total: totalIncidents,
    });
  } catch (e) {
    console.error("getSuperAdminIncidents error:", e);
    // Return empty data structure if incidents table doesn't exist
    return res.json({
      incidents: [],
      statusBreakdown: [],
      byTenant: [],
      total: 0,
    });
  }
};

/**
 * GET /api/super-admin/company-rankings
 * Get company rankings based on growth metrics
 */
exports.getCompanyRankings = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const days = parseInt(req.query.days) || 30;

    // Get current period metrics
    const currentMetricsResult = await sequelize.query(`
      SELECT 
        t.id,
        t.name,
        t.location,
        t.subscription_plan,
        t.status,
        COUNT(DISTINCT g.id)::integer as guard_count,
        COUNT(DISTINCT s.id)::integer as shift_count,
        COUNT(DISTINCT CASE WHEN s.shift_date >= CURRENT_DATE - INTERVAL '${days} days' THEN s.id END)::integer as shifts_last_period,
        COUNT(DISTINCT CASE WHEN s.shift_date >= CURRENT_DATE - INTERVAL '${days * 2} days' 
          AND s.shift_date < CURRENT_DATE - INTERVAL '${days} days' THEN s.id END)::integer as shifts_previous_period
      FROM tenants t
      LEFT JOIN guards g ON g.tenant_id = t.id
      LEFT JOIN shifts s ON s.tenant_id = t.id
      WHERE t.status != 'inactive'
      GROUP BY t.id, t.name, t.location, t.subscription_plan, t.status
    `);

    // Calculate growth rates
    // Sequelize query returns [rows, metadata], so currentMetricsResult[0] is the array
    const metricsArray = Array.isArray(currentMetricsResult[0]) ? currentMetricsResult[0] : [];
    const rankings = metricsArray.map((tenant) => {
      const current = parseInt(tenant.shifts_last_period) || 0;
      const previous = parseInt(tenant.shifts_previous_period) || 0;
      const growth = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
      
      return {
        ...tenant,
        growth_rate: parseFloat(growth.toFixed(2)),
        trend: growth > 5 ? "growing" : growth < -5 ? "declining" : "stable",
      };
    });

    // Sort by growth rate (descending)
    rankings.sort((a, b) => b.growth_rate - a.growth_rate);

    // Add rank
    rankings.forEach((tenant, index) => {
      tenant.rank = index + 1;
    });

    return res.json(rankings);
  } catch (e) {
    console.error("getCompanyRankings error:", e);
    return res.status(500).json({
      message: "Failed to get company rankings",
      error: e.message,
    });
  }
};
