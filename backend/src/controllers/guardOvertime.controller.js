/**
 * Guard overtime API — unified admin backend (guard-ui expects /api/guard/overtime/*).
 */
const overtimeStatusService = require("../services/overtimeStatus.service");

function guardIdFromReq(req) {
  return req.guard?.id || req.user?.guardId;
}

function sequelizeFromReq(req) {
  return req.app.locals.models?.sequelize;
}

exports.getOvertimeStatus = async (req, res) => {
  try {
    const { shiftId } = req.params;
    const guardId = guardIdFromReq(req);
    const sequelize = sequelizeFromReq(req);

    if (!shiftId) return res.status(400).json({ message: "Missing shiftId" });
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });

    const status = await overtimeStatusService.getOvertimeStatus(sequelize, guardId, shiftId);
    return res.json(status);
  } catch (error) {
    console.error("getOvertimeStatus:", error);
    if (error.message === "Shift not found") {
      return res.json({
        currentHours: 0,
        weeklyHours: 0,
        projectedDaily: 0,
        projectedWeekly: 0,
        dailyOTThreshold: 8,
        weeklyOTThreshold: 40,
        status: "not_available",
        alerts: [],
        requiresApproval: false,
      });
    }
    return res.status(500).json({
      message: "Failed to get overtime status",
      error: error.message,
    });
  }
};

exports.getOvertimeOffers = async (req, res) => {
  try {
    const guardId = guardIdFromReq(req);
    const sequelize = sequelizeFromReq(req);
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });

    const [rows] = await sequelize.query(
      `SELECT
         oo.id,
         oo.shift_id,
         oo.proposed_end_time,
         oo.current_end_time,
         oo.extension_hours,
         oo.reason,
         oo.status,
         oo.created_at,
         oo.expires_at,
         s.shift_date,
         s.shift_start,
         s.shift_end,
         s.location,
         oo.meta
       FROM overtime_offers oo
       LEFT JOIN shifts s ON oo.shift_id = s.id
       WHERE oo.guard_id = $1::uuid
         AND oo.status IN ('pending', 'requested')
         AND (oo.expires_at IS NULL OR oo.expires_at > NOW())
       ORDER BY oo.created_at DESC
       LIMIT 10`,
      { bind: [guardId] }
    );

    return res.json({ data: rows || [] });
  } catch (error) {
    console.error("getOvertimeOffers:", error);
    return res.status(500).json({
      message: "Failed to get overtime offers",
      error: error.message,
    });
  }
};

exports.acceptOvertimeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const guardId = guardIdFromReq(req);
    const sequelize = sequelizeFromReq(req);
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });

    const [offers] = await sequelize.query(
      `SELECT * FROM overtime_offers WHERE id = $1::uuid AND guard_id = $2::uuid`,
      { bind: [offerId, guardId] }
    );
    const offer = offers?.[0];
    if (!offer) return res.status(404).json({ message: "Overtime offer not found" });
    if (offer.status !== "pending" && offer.status !== "requested") {
      return res.status(400).json({ message: `Cannot accept offer with status: ${offer.status}` });
    }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      return res.status(400).json({ message: "Offer has expired" });
    }

    await sequelize.query(
      `UPDATE overtime_offers SET status = 'accepted', guard_response_at = NOW() WHERE id = $1::uuid`,
      { bind: [offerId] }
    );

    return res.json({ ok: true, message: "Overtime offer accepted" });
  } catch (error) {
    console.error("acceptOvertimeOffer:", error);
    return res.status(500).json({ message: "Failed to accept overtime offer", error: error.message });
  }
};

exports.declineOvertimeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const guardId = guardIdFromReq(req);
    const sequelize = sequelizeFromReq(req);
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });

    const [offers] = await sequelize.query(
      `SELECT id, status FROM overtime_offers WHERE id = $1::uuid AND guard_id = $2::uuid`,
      { bind: [offerId, guardId] }
    );
    const offer = offers?.[0];
    if (!offer) return res.status(404).json({ message: "Overtime offer not found" });
    if (offer.status !== "pending") {
      return res.status(400).json({ message: `Cannot decline offer with status: ${offer.status}` });
    }

    await sequelize.query(
      `UPDATE overtime_offers SET status = 'declined', guard_response_at = NOW() WHERE id = $1::uuid`,
      { bind: [offerId] }
    );

    return res.json({ ok: true, message: "Overtime offer declined" });
  } catch (error) {
    console.error("declineOvertimeOffer:", error);
    return res.status(500).json({ message: "Failed to decline overtime offer", error: error.message });
  }
};

exports.requestOvertime = async (req, res) => {
  try {
    const guardId = guardIdFromReq(req);
    const sequelize = sequelizeFromReq(req);
    const { shiftId, proposedEndTime, reason, extensionHours } = req.body || {};

    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });
    if (!shiftId || !proposedEndTime) {
      return res.status(400).json({ message: "shiftId and proposedEndTime are required" });
    }

    const [shiftRows] = await sequelize.query(
      `SELECT id, shift_end FROM public.shifts WHERE id = $1::uuid LIMIT 1`,
      { bind: [shiftId] }
    );
    const shift = shiftRows?.[0];
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const [insertRows] = await sequelize.query(
      `INSERT INTO overtime_offers
         (shift_id, guard_id, admin_id, proposed_end_time, current_end_time, extension_hours, reason, status, created_at)
       VALUES
         ($1::uuid, $2::uuid, NULL, $3::timestamptz, $4::time, $5, $6, 'requested', NOW())
       RETURNING id`,
      {
        bind: [
          shiftId,
          guardId,
          proposedEndTime,
          shift.shift_end,
          extensionHours || null,
          reason || null,
        ],
      }
    );

    return res.status(201).json({ ok: true, id: insertRows?.[0]?.id });
  } catch (error) {
    console.error("requestOvertime:", error);
    return res.status(500).json({ message: "Failed to request overtime", error: error.message });
  }
};
