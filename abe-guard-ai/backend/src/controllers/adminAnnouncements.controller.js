const { pool } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * POST /api/admin/announcements
 * Create a new announcement
 * Body: { title, message, category, priority, tenant_id?, site_id?, expires_at?, meta? }
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      title,
      message,
      category = "COMPANY_WIDE",
      priority = "MEDIUM",
      tenant_id,
      site_id,
      expires_at,
      meta,
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    // Validate category
    const validCategories = [
      "COMPANY_WIDE",
      "SITE_SPECIFIC",
      "POLICY_UPDATE",
      "SHIFT_CHANGE",
      "EMERGENCY_ALERT",
      "TRAINING_NOTICE",
      "SYSTEM_UPDATE",
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    // Validate priority
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: "Invalid priority" });
    }

    // Use admin's tenant_id if not provided
    // Validate and sanitize UUID fields - empty strings should be null
    let finalTenantId = tenant_id || req.user?.tenant_id || req.admin?.tenant_id || null;
    // Convert empty strings, "1", or invalid values to null
    if (!finalTenantId || finalTenantId === "" || finalTenantId === "1" || finalTenantId === "null") {
      finalTenantId = null;
    } else {
      // Validate tenant_id is a valid UUID format if provided
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalTenantId)) {
        return res.status(400).json({ error: "Invalid tenant_id format. Must be a valid UUID or leave empty for company-wide." });
      }
    }

    // Validate and sanitize site_id
    let finalSiteId = site_id || null;
    // Convert empty strings, "1", or invalid values to null
    if (!finalSiteId || finalSiteId === "" || finalSiteId === "1" || finalSiteId === "null") {
      finalSiteId = null;
    } else {
      // Validate site_id is a valid UUID format if provided
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalSiteId)) {
        return res.status(400).json({ error: "Invalid site_id format. Must be a valid UUID or leave empty." });
      }
    }

    // Validate adminId - it should be a UUID from JWT
    // If adminId is not a valid UUID, set it to NULL (some systems use integer IDs)
    let finalAdminId = adminId;
    if (adminId) {
      const adminIdStr = String(adminId);
      // Check if it's a valid UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminIdStr)) {
        console.warn("⚠️ Admin ID is not a valid UUID format:", adminId, typeof adminId);
        console.warn("⚠️ Setting created_by_admin_id to NULL (adminId must be UUID)");
        finalAdminId = null; // Set to NULL if not a valid UUID
      }
    }

    const announcementId = uuidv4();

    // Build the query with proper NULL handling for UUID fields
    const insertRes = await pool.query(
      `INSERT INTO public.announcements (
        id, title, message, category, priority, tenant_id, site_id, 
        is_active, expires_at, created_by_admin_id, meta, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        announcementId,
        title,
        message,
        category,
        priority,
        finalTenantId, // NULL is handled automatically by PostgreSQL
        finalSiteId,   // NULL is handled automatically by PostgreSQL
        true, // is_active
        expires_at || null,
        finalAdminId, // UUID from JWT, or NULL if not a valid UUID
        meta ? JSON.stringify(meta) : null,
      ]
    );

    const announcement = insertRes.rows[0];

    return res.json({
      success: true,
      message: "Announcement created successfully",
      data: {
        id: announcement.id,
        title: announcement.title,
        message: announcement.message,
        category: announcement.category,
        priority: announcement.priority,
        tenantId: announcement.tenant_id,
        siteId: announcement.site_id,
        createdAt: announcement.created_at,
        expiresAt: announcement.expires_at,
        meta: announcement.meta,
      },
    });
  } catch (err) {
    console.error("Create announcement error:", err);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
};

/**
 * GET /api/admin/announcements
 * Get all announcements (for admin view)
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Filter by tenant if admin has tenant_id
    // Admins should see: their tenant's announcements + company-wide (tenant_id IS NULL)
    const tenantId = req.user?.tenant_id || req.admin?.tenant_id;
    let query = `SELECT * FROM public.announcements WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      // Show announcements for this tenant OR company-wide (NULL)
      query += ` AND (tenant_id = $${paramIndex} OR tenant_id IS NULL)`;
      params.push(tenantId);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    const announcements = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      category: row.category,
      priority: row.priority,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      isActive: row.is_active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      meta: row.meta,
      createdByAdminId: row.created_by_admin_id,
    }));

    return res.json({
      data: announcements,
      total: announcements.length,
    });
  } catch (err) {
    console.error("Get announcements error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * PUT /api/admin/announcements/:id
 * Update an announcement
 */
exports.updateAnnouncement = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    const announcementId = req.params.id;

    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      title,
      message,
      category,
      priority,
      is_active,
      expires_at,
      meta,
    } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    if (message !== undefined) {
      updates.push(`message = $${paramIndex}`);
      params.push(message);
      paramIndex++;
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }
    if (expires_at !== undefined) {
      updates.push(`expires_at = $${paramIndex}`);
      params.push(expires_at);
      paramIndex++;
    }
    if (meta !== undefined) {
      updates.push(`meta = $${paramIndex}`);
      params.push(JSON.stringify(meta));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(announcementId);

    const query = `UPDATE public.announcements 
                   SET ${updates.join(", ")} 
                   WHERE id = $${paramIndex}
                   RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    return res.json({
      success: true,
      message: "Announcement updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Update announcement error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * DELETE /api/admin/announcements/:id
 * Delete an announcement (soft delete by setting is_active = false)
 */
exports.deleteAnnouncement = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    const announcementId = req.params.id;

    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      `UPDATE public.announcements 
       SET is_active = false, updated_at = NOW() 
       WHERE id = $1 
       RETURNING id`,
      [announcementId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    return res.json({
      success: true,
      message: "Announcement deleted successfully",
    });
  } catch (err) {
    console.error("Delete announcement error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
