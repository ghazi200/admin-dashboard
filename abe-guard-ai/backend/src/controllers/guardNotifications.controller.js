const { pool } = require("../config/db");
const { getGuardTenantSqlFilter } = require("../utils/guardTenantFilter");

/**
 * GET /api/guard/notifications
 * Get all notifications for the authenticated guard
 */
exports.getGuardNotifications = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const unreadOnly = req.query.unreadOnly === "true";

    let query = `
      SELECT 
        id,
        type,
        title,
        message,
        shift_id,
        read_at,
        created_at,
        meta
      FROM public.guard_notifications
      WHERE guard_id = $1
    `;
    
    const params = [guardId];
    
    if (unreadOnly) {
      query += ` AND read_at IS NULL`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    return res.json({
      notifications: result.rows || [],
      count: result.rows?.length || 0
    });
  } catch (err) {
    console.error("Get guard notifications error:", err);
    return res.status(500).json({ 
      error: "Server error", 
      message: err.message 
    });
  }
};

/**
 * GET /api/guard/notifications/unread-count
 * Get count of unread notifications
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM public.guard_notifications 
       WHERE guard_id = $1 AND read_at IS NULL`,
      [guardId]
    );

    const count = parseInt(result.rows[0]?.count || 0);

    return res.json({ unreadCount: count });
  } catch (err) {
    console.error("Get unread count error:", err);
    return res.status(500).json({ 
      error: "Server error", 
      message: err.message 
    });
  }
};

/**
 * POST /api/guard/notifications/:id/read
 * Mark a notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const notificationId = req.params.id;
    
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    if (!notificationId) {
      return res.status(400).json({ error: "Notification ID required" });
    }

    // Verify the notification belongs to this guard
    const checkResult = await pool.query(
      `SELECT id FROM public.guard_notifications 
       WHERE id = $1 AND guard_id = $2`,
      [notificationId, guardId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Mark as read
    await pool.query(
      `UPDATE public.guard_notifications 
       SET read_at = NOW() 
       WHERE id = $1 AND guard_id = $2`,
      [notificationId, guardId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Mark notification as read error:", err);
    return res.status(500).json({ 
      error: "Server error", 
      message: err.message 
    });
  }
};

/**
 * POST /api/guard/notifications/mark-all-read
 * Mark all notifications as read for the authenticated guard
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    await pool.query(
      `UPDATE public.guard_notifications 
       SET read_at = NOW() 
       WHERE guard_id = $1 AND read_at IS NULL`,
      [guardId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Mark all as read error:", err);
    return res.status(500).json({ 
      error: "Server error", 
      message: err.message 
    });
  }
};
