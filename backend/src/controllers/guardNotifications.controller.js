/**
 * Guard notifications from shared Postgres (guard_notifications).
 * Replaces empty stubs so the Guard app can see accept confirm/reject alerts.
 */
exports.listGuardNotifications = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ error: "Unauthorized" });
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ error: "Database not available" });

    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 100);
    const unreadOnly = String(req.query.unreadOnly || "") === "true";
    const bind = [guardId];
    let sql = `
      SELECT id, type, title, message, shift_id, read_at, created_at, meta
      FROM public.guard_notifications
      WHERE guard_id = $1::uuid
    `;
    if (unreadOnly) sql += ` AND read_at IS NULL`;
    bind.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${bind.length}`;

    const [rows] = await sequelize.query(sql, { bind });
    return res.json({
      notifications: rows || [],
      count: (rows || []).length,
    });
  } catch (e) {
    console.error("listGuardNotifications:", e?.message || e);
    return res.status(500).json({ error: "Server error", message: e.message });
  }
};

exports.guardNotificationsUnreadCount = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ error: "Unauthorized" });
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ error: "Database not available" });

    const [rows] = await sequelize.query(
      `SELECT COUNT(*)::int AS count
       FROM public.guard_notifications
       WHERE guard_id = $1::uuid AND read_at IS NULL`,
      { bind: [guardId] }
    );
    return res.json({ unreadCount: rows?.[0]?.count || 0 });
  } catch (e) {
    console.error("guardNotificationsUnreadCount:", e?.message || e);
    return res.status(500).json({ error: "Server error", message: e.message });
  }
};

exports.markGuardNotificationRead = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    const notificationId = req.params.id;
    if (!guardId) return res.status(401).json({ error: "Unauthorized" });
    if (!notificationId) return res.status(400).json({ error: "Notification ID required" });
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ error: "Database not available" });

    const [upd] = await sequelize.query(
      `UPDATE public.guard_notifications
       SET read_at = NOW()
       WHERE id = $1 AND guard_id = $2::uuid
       RETURNING id`,
      { bind: [notificationId, guardId] }
    );
    if (!upd?.[0]) return res.status(404).json({ error: "Notification not found" });
    return res.json({ success: true, ok: true });
  } catch (e) {
    console.error("markGuardNotificationRead:", e?.message || e);
    return res.status(500).json({ error: "Server error", message: e.message });
  }
};

exports.markAllGuardNotificationsRead = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ error: "Unauthorized" });
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) return res.status(500).json({ error: "Database not available" });

    await sequelize.query(
      `UPDATE public.guard_notifications
       SET read_at = NOW()
       WHERE guard_id = $1::uuid AND read_at IS NULL`,
      { bind: [guardId] }
    );
    return res.json({ success: true, ok: true });
  } catch (e) {
    console.error("markAllGuardNotificationsRead:", e?.message || e);
    return res.status(500).json({ error: "Server error", message: e.message });
  }
};
