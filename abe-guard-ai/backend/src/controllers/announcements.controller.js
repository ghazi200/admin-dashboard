const { pool } = require("../config/db");

/**
 * GET /announcements
 * Get all active announcements for the authenticated guard
 * Filters by tenant_id and site_id (if guard is assigned to a site)
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const guardId = req.user?.guardId;
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get guard's tenant_id from JWT token (if available) or from database
    // Note: Guards table might not have tenant_id column, so we'll use JWT tenant_id if available
    const tenantId = req.user?.tenant_id || null;
    
    // Verify guard exists (optional check)
    let guardExists = true;
    try {
      const guardCheck = await pool.query(
        `SELECT id FROM "Guards" WHERE id::text = $1 OR id = $1::integer LIMIT 1`,
        [guardId]
      );
      guardExists = guardCheck.rows.length > 0;
    } catch (e) {
      // If table doesn't exist or query fails, continue anyway
      console.warn("Could not verify guard existence:", e.message);
    }

    // Get guard's current shift to determine site
    // Note: shifts table doesn't have site_id, so we'll skip site-specific filtering for now
    // Site-specific announcements can be filtered by tenant_id instead
    const siteId = null;

    // Query announcements:
    // 1. Company-wide (tenant_id is NULL OR matches guard's tenant, site_id is NULL)
    // 2. Site-specific (site_id matches guard's current site)
    // 3. Must be active
    // 4. Must not be expired
    let query;
    let params;
    
    if (tenantId) {
      query = `SELECT 
        a.id,
        a.title,
        a.message,
        a.category,
        a.priority,
        a.site_id,
        a.created_at,
        a.expires_at,
        a.meta,
        CASE WHEN ar.id IS NOT NULL THEN true ELSE false END as is_read,
        ar.read_at
      FROM public.announcements a
      LEFT JOIN public.announcement_reads ar ON a.id = ar.announcement_id 
        AND ar.guard_id::text = $1
      WHERE a.is_active = true
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND (a.tenant_id IS NULL OR a.tenant_id = $2::uuid)
        AND a.site_id IS NULL
      ORDER BY 
        CASE a.priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        a.created_at DESC`;
      params = [String(guardId), String(tenantId)];
    } else {
      query = `SELECT 
        a.id,
        a.title,
        a.message,
        a.category,
        a.priority,
        a.site_id,
        a.created_at,
        a.expires_at,
        a.meta,
        CASE WHEN ar.id IS NOT NULL THEN true ELSE false END as is_read,
        ar.read_at
      FROM public.announcements a
      LEFT JOIN public.announcement_reads ar ON a.id = ar.announcement_id 
        AND ar.guard_id::text = $1
      WHERE a.is_active = true
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND a.tenant_id IS NULL
        AND a.site_id IS NULL
      ORDER BY 
        CASE a.priority
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        a.created_at DESC`;
      params = [String(guardId)];
    }
    
    const announcementsRes = await pool.query(query, params);

    const announcements = announcementsRes.rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      category: row.category,
      priority: row.priority,
      siteId: row.site_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      meta: row.meta,
      isRead: row.is_read,
      readAt: row.read_at,
    }));

    // Count unread
    const unreadCount = announcements.filter((a) => !a.isRead).length;

    return res.json({
      data: announcements,
      unreadCount,
      total: announcements.length,
    });
  } catch (err) {
    console.error("Get announcements error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
};

/**
 * POST /announcements/:id/read
 * Mark an announcement as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const guardId = req.user?.guardId;
    const announcementId = req.params.id;

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!announcementId) {
      return res.status(400).json({ error: "Announcement ID required" });
    }

    // Check if already read (guard_id is UUID)
    const existingRead = await pool.query(
      `SELECT id, read_at FROM public.announcement_reads 
       WHERE announcement_id = $1::uuid AND guard_id::text = $2`,
      [announcementId, String(guardId)]
    );

    if (existingRead.rows[0]) {
      return res.json({
        success: true,
        message: "Already marked as read",
        readAt: existingRead.rows[0].read_at,
      });
    }

    // Mark as read (guard_id is UUID in database)
    // Note: guardId from JWT should be a UUID string
    const insertRes = await pool.query(
      `INSERT INTO public.announcement_reads (announcement_id, guard_id, read_at)
       VALUES ($1::uuid, $2::uuid, NOW())
       RETURNING id, read_at`,
      [announcementId, String(guardId)]
    );

    return res.json({
      success: true,
      message: "Announcement marked as read",
      readAt: insertRes.rows[0].read_at,
    });
  } catch (err) {
    console.error("Mark as read error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
};

/**
 * GET /announcements/unread-count
 * Get count of unread announcements
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const guardId = req.user?.guardId;
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get guard's tenant_id from JWT token (if available)
    const tenantId = req.user?.tenant_id || null;

    // Get guard's current site
    // Note: shifts table doesn't have site_id, so we'll skip site-specific filtering
    const siteId = null;

    // Count unread announcements
    let countQuery;
    let countParams;
    
    if (tenantId) {
      countQuery = `SELECT COUNT(*) as count
      FROM public.announcements a
      LEFT JOIN public.announcement_reads ar ON a.id = ar.announcement_id 
        AND ar.guard_id::text = $1
      WHERE a.is_active = true
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND ar.id IS NULL
        AND (a.tenant_id IS NULL OR a.tenant_id = $2::uuid)
        AND a.site_id IS NULL`;
      countParams = [String(guardId), String(tenantId)];
    } else {
      countQuery = `SELECT COUNT(*) as count
      FROM public.announcements a
      LEFT JOIN public.announcement_reads ar ON a.id = ar.announcement_id 
        AND ar.guard_id::text = $1
      WHERE a.is_active = true
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND ar.id IS NULL
        AND a.tenant_id IS NULL
        AND a.site_id IS NULL`;
      countParams = [String(guardId)];
    }
    
    const countRes = await pool.query(countQuery, countParams);

    const unreadCount = parseInt(countRes.rows[0].count, 10);

    return res.json({
      unreadCount,
    });
  } catch (err) {
    console.error("Get unread count error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ error: "Server error", message: err.message });
  }
};
