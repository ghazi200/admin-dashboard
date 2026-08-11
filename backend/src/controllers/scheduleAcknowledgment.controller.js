const {
  acknowledgeSchedule,
  listAcknowledgments,
  getAckForGuard,
  currentWeekRange,
} = require("../services/scheduleAcknowledgment.service");

/**
 * POST /api/guard/schedule/acknowledge
 * Body: { note?, period_start?, period_end? } — defaults to current Mon–Sun week
 */
exports.acknowledgeMySchedule = async (req, res) => {
  try {
    const result = await acknowledgeSchedule(req, {
      periodStart: req.body?.period_start ?? req.body?.periodStart,
      periodEnd: req.body?.period_end ?? req.body?.periodEnd,
      note: req.body?.note,
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Acknowledge failed" });
  }
};

/**
 * GET /api/guard/schedule/acknowledgment?period_start&period_end
 */
exports.getMyScheduleAcknowledgment = async (req, res) => {
  try {
    const week = currentWeekRange();
    const periodStart = req.query.period_start || req.query.periodStart || week.start;
    const periodEnd = req.query.period_end || req.query.periodEnd || week.end;
    const guardId = req.guard?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Guard authentication required" });
    }
    const result = await getAckForGuard(req.app.locals.models, {
      guardId,
      periodStart,
      periodEnd,
    });
    return res.json({
      period: { start: periodStart, end: periodEnd },
      ...result,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to load acknowledgment" });
  }
};

/**
 * GET /api/admin/schedule/acknowledgments?period_start&period_end&tenant_id&limit
 */
exports.listScheduleAcknowledgments = async (req, res) => {
  try {
    const result = await listAcknowledgments(req, {
      periodStart: req.query.period_start || req.query.periodStart,
      periodEnd: req.query.period_end || req.query.periodEnd,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || "Failed to list acknowledgments" });
  }
};
