/**
 * Minimal guard-ui compatibility when abe-guard-ai is not deployed.
 * Notifications + traffic alerts can be wired to real services later.
 */

exports.listGuardNotifications = (req, res) => {
  res.json({ notifications: [] });
};

exports.guardNotificationsUnreadCount = (req, res) => {
  res.json({ unreadCount: 0 });
};

exports.markGuardNotificationRead = (req, res) => {
  res.json({ ok: true });
};

exports.markAllGuardNotificationsRead = (req, res) => {
  res.json({ ok: true });
};

/** Shape expected by ShiftAlerts.jsx (weather/traffic/transit may be null) */
exports.getCombinedAlerts = (req, res) => {
  res.json({
    weather: null,
    traffic: null,
    transit: { options: [] },
  });
};
