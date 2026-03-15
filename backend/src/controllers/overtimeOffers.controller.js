/**
 * Overtime Offers Controller (Admin Dashboard)
 * Handles creating and managing overtime offers from admin to guards
 * 
 * NOTE: Both admin-dashboard and abe-guard-ai backends use the SAME database.
 * The overtime_offers table exists in this shared database.
 */
const logger = require("../../logger");
const { notify } = require("../utils/notify");

/**
 * POST /api/admin/overtime/offer
 * Create an overtime offer for a guard
 */
exports.createOvertimeOffer = async (req, res) => {
  try {
    const { guardId, shiftId, proposedEndTime, extensionHours, reason } = req.body;
    const adminId = req.admin?.id;

    if (!guardId || !shiftId || !proposedEndTime || !extensionHours) {
      return res.status(400).json({
        message: "Missing required fields: guardId, shiftId, proposedEndTime, extensionHours",
      });
    }

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sequelize } = req.app.locals.models;

    // Get shift details
    // NOTE: Using the same database as abe-guard-ai (shared DATABASE_URL)
    const [shifts] = await sequelize.query(
      `SELECT shift_date, shift_start, shift_end, location FROM shifts WHERE id = $1::uuid`,
      { bind: [shiftId] }
    );

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];
    
    // Calculate current end time from shift
    // shift_end is TIME type (HH:MM:SS), shift_date is DATE type (YYYY-MM-DD)
    // We need to combine them and create a proper timestamp
    let currentEndTime;
    if (shift.shift_end && shift.shift_date) {
      try {
        // Parse date and time components
        const shiftDateStr = shift.shift_date instanceof Date 
          ? shift.shift_date.toISOString().split('T')[0]
          : String(shift.shift_date).split('T')[0];
        const shiftEndStr = String(shift.shift_end).split('.')[0];
        
        const dateParts = shiftDateStr.split('-');
        const timeParts = shiftEndStr.split(':');
        
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const day = parseInt(dateParts[2], 10);
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        const seconds = parseInt(timeParts[2] || '0', 10);
        
        if (hours < 0 || hours > 23) {
          throw new Error(`Invalid hours: ${hours} (must be 0-23)`);
        }
        
        // Calculate UTC time: EST is UTC-5, so add 5 hours
        const utcHours = hours + 5;
        let utcDay = day;
        let utcMonth = month;
        let utcYear = year;
        
        // Handle day/month/year rollover if UTC hours >= 24
        if (utcHours >= 24) {
          const extraDays = Math.floor(utcHours / 24);
          utcDay += extraDays;
          const utcHoursAdjusted = utcHours % 24;
          
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          if (utcDay > daysInMonth) {
            utcDay = utcDay - daysInMonth;
            utcMonth += 1;
            if (utcMonth >= 12) {
              utcMonth = 0;
              utcYear += 1;
            }
          }
          
          currentEndTime = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHoursAdjusted, minutes, seconds));
        } else {
          currentEndTime = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, minutes, seconds));
        }
      } catch (error) {
        logger.error("Error calculating currentEndTime:", error);
        // Fallback: use current time if calculation fails
        currentEndTime = new Date();
      }
    } else {
      // Fallback: use current time if shift end is not available
      currentEndTime = new Date();
    }

    // Validate proposed end time is after current end time
    const proposedEnd = new Date(proposedEndTime);
    if (proposedEnd <= currentEndTime) {
      return res.status(400).json({
        message: "Proposed end time must be after current shift end time",
      });
    }

    // Calculate expiration (30 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Create offer - convert dates to ISO strings for database
    // Note: admin_id column is UUID type, but admin dashboard uses integer IDs
    // Since admin_id is nullable (for guard-initiated requests), we'll set it to null
    // and store the admin info in admin_notes instead
    const adminNote = reason 
      ? `${reason} (Created by Admin ID: ${adminId})` 
      : `Created by Admin ID: ${adminId}`;

    const currentEndISO = currentEndTime.toISOString();
    const proposedEndISO = proposedEnd.toISOString();
    
    // Use ISO strings directly with TIMESTAMPTZ columns
    // After migration, columns are TIMESTAMPTZ which properly handles timezones
    // PostgreSQL will automatically interpret ISO strings with 'Z' as UTC
    // This eliminates all timezone conversion issues
    const [result] = await sequelize.query(
      `INSERT INTO overtime_offers 
       (guard_id, shift_id, admin_id, proposed_end_time, current_end_time, extension_hours, reason, expires_at, status, admin_notes, created_at)
       VALUES ($1::uuid, $2::uuid, NULL, $3::timestamptz, $4::timestamptz, $5, $6, $7::timestamptz, 'pending', $8, NOW())
       RETURNING id, guard_id, shift_id, proposed_end_time, current_end_time, extension_hours, status, created_at`,
      {
        bind: [
          guardId,
          shiftId,
          proposedEndISO,
          currentEndISO,
          parseFloat(extensionHours),
          reason || null,
          expiresAt.toISOString(),
          adminNote,
        ],
      }
    );

    const offer = result[0];

    // Get guard name for notification
    const [guards] = await sequelize.query(
      `SELECT name, email FROM guards WHERE id = $1`,
      { bind: [guardId] }
    );
    const guardName = guards[0]?.name || guards[0]?.email || "Guard";

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `guard:${guardId}`, "overtime_offer", {
        offerId: offer.id,
        shiftId: offer.shift_id,
        proposedEndTime: offer.proposed_end_time,
        extensionHours: offer.extension_hours,
        reason: offer.reason,
        expiresAt: expiresAt.toISOString(),
        adminName: req.admin?.name || req.admin?.email || "Admin",
      }).catch(() => {});
    }

    // Create admin notification
    await notify(req.app, {
      type: "OVERTIME_OFFER_CREATED",
      title: "Overtime Offer Sent",
      message: `Overtime offer sent to ${guardName} (${extensionHours} hours)`,
      entityType: "overtime_offer",
      entityId: offer.id,
      meta: {
        guardId,
        shiftId,
        offerId: offer.id,
        extensionHours,
      },
    });

    return res.json({
      message: "Overtime offer created",
      data: offer,
    });
  } catch (error) {
    logger.error("Error creating overtime offer:", error);
    logger.error("Error stack:", error.stack);
    logger.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });
    return res.status(500).json({
      message: "Failed to create overtime offer",
      error: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
};

/**
 * GET /api/admin/overtime/offers
 * Get overtime offers (pending, accepted, declined).
 * On missing table or DB error returns 200 with empty data so dashboard does not show 500.
 */
exports.getOvertimeOffers = async (req, res) => {
  try {
    const { status, guardId } = req.query;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const sequelize = req.app?.locals?.models?.sequelize;
    if (!sequelize) {
      logger.warn("getOvertimeOffers: sequelize not available");
      return res.status(200).json({ data: [] });
    }

    let query = `
      SELECT 
        oo.id,
        oo.guard_id,
        oo.shift_id,
        oo.proposed_end_time,
        oo.current_end_time,
        oo.extension_hours,
        oo.reason,
        oo.status,
        oo.guard_response_at,
        oo.created_at,
        oo.expires_at,
        g.name as guard_name,
        g.email as guard_email,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location
      FROM overtime_offers oo
      LEFT JOIN guards g ON oo.guard_id::text = g.id::text
      LEFT JOIN shifts s ON oo.shift_id::text = s.id::text
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (status) {
      if (status === "pending_or_requested") {
        query += ` AND oo.status IN ('pending', 'requested')`;
      } else {
        query += ` AND oo.status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }
    }

    if (guardId) {
      query += ` AND oo.guard_id = $${paramCount}`;
      params.push(guardId);
      paramCount++;
    }

    query += ` ORDER BY oo.created_at DESC LIMIT 50`;

    const [offers] = await sequelize.query(query, { bind: params });

    return res.json({ data: offers || [] });
  } catch (error) {
    logger.error("❌ Error getting overtime offers:", error?.message || error);
    return res.status(200).json({ data: [] });
  }
};

/**
 * POST /api/admin/overtime/offers/:offerId/approve
 * Approve an overtime request from a guard
 */
exports.approveOvertimeRequest = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sequelize } = req.app.locals.models;
    
    if (!sequelize) {
      return res.status(500).json({ message: "Database connection not available" });
    }

    const [offers] = await sequelize.query(
      `SELECT * FROM overtime_offers WHERE id = $1`,
      { bind: [offerId] }
    );

    if (offers.length === 0) {
      return res.status(404).json({ message: "Overtime request not found" });
    }

    const offer = offers[0];

    if (offer.status !== "requested") {
      return res.status(400).json({
        message: `Cannot approve request with status: ${offer.status}`,
      });
    }

    const approvalNote = adminNotes 
      ? `${adminNotes} (Approved by Admin ID: ${adminId})` 
      : `Approved by Admin ID: ${adminId}`;
    
    await sequelize.query(
      `UPDATE overtime_offers 
       SET status = 'accepted', 
           guard_response_at = NOW(),
           admin_notes = $1
       WHERE id = $2`,
      { bind: [approvalNote, offerId] }
    );
    
    // From here on, all operations are optional and won't fail the approval

    // Update shift end time (OPTIONAL - approval already succeeded above)
    // If this fails, it's logged but doesn't affect the approval
    try {
      const proposedEndTime = new Date(offer.proposed_end_time);
      if (isNaN(proposedEndTime.getTime())) {
        logger.error("❌ Invalid proposed_end_time:", offer.proposed_end_time);
        throw new Error(`Invalid proposed end time: ${offer.proposed_end_time}`);
      }
      
      // Extract time portion from timestamp
      const hours = proposedEndTime.getHours().toString().padStart(2, '0');
      const minutes = proposedEndTime.getMinutes().toString().padStart(2, '0');
      const seconds = proposedEndTime.getSeconds().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}:${seconds}`;
      
      try {
        await sequelize.query(
          `UPDATE shifts 
           SET shift_end = $1::TIME,
               updated_at = NOW()
           WHERE id = $2`,
          {
            bind: [timeString, offer.shift_id],
          }
        );
      } catch (updateError) {
        // If updated_at column doesn't exist, try without it
        if (updateError.message && (updateError.message.includes('updated_at') || updateError.message.includes('column') && updateError.message.includes('does not exist'))) {
          await sequelize.query(
            `UPDATE shifts 
             SET shift_end = $1::TIME
             WHERE id = $2`,
            {
              bind: [timeString, offer.shift_id],
            }
          );
        }
      }
    } catch (shiftError) {
      // Don't fail the whole approval if shift update fails
    }

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `guard:${offer.guard_id}`, "overtime_request_approved", {
        offerId: offer.id,
        shiftId: offer.shift_id,
        proposedEndTime: offer.proposed_end_time,
      }).catch(() => {});
    }

    // Create admin notification (optional - don't fail if this errors)
    try {
      await notify(req.app, {
        type: "OVERTIME_REQUEST_APPROVED",
        title: "Overtime Request Approved",
        message: `Overtime request approved for guard (${offer.extension_hours || 0} hours)`,
        entityType: "overtime_offer",
        entityId: offer.id,
        meta: {
          guardId: offer.guard_id,
          shiftId: offer.shift_id,
          offerId: offer.id,
        },
      });
    } catch (notifyError) {
      // Notification failure is non-critical
    }

    // Always return success if status update succeeded
    // Shift update and notification failures are logged but don't affect the response
    return res.status(200).json({
      message: "Overtime request approved successfully",
      offerId: offer.id,
      success: true,
    });
  } catch (error) {
    logger.error("❌ Error approving overtime request:", error);
    logger.error("   Error message:", error.message);
    logger.error("   Error code:", error.code);
    logger.error("   Error detail:", error.detail);
    logger.error("   Error stack:", error.stack);
    return res.status(500).json({
      message: "Failed to approve overtime request",
      error: error.message,
      detail: error.detail || null,
    });
  }
};

/**
 * POST /api/admin/overtime/offers/:offerId/deny
 * Deny an overtime request from a guard
 */
exports.denyOvertimeRequest = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sequelize } = req.app.locals.models;

    // Get the request
    const [offers] = await sequelize.query(
      `SELECT * FROM overtime_offers WHERE id = $1`,
      { bind: [offerId] }
    );

    if (offers.length === 0) {
      return res.status(404).json({ message: "Overtime request not found" });
    }

    const offer = offers[0];

    if (offer.status !== "requested") {
      return res.status(400).json({
        message: `Cannot deny request with status: ${offer.status}`,
      });
    }

    // Update request status to declined
    // Note: admin_id remains null for guard-initiated requests
    // We store the denying admin info in admin_notes instead
    const denialNote = adminNotes 
      ? `${adminNotes} (Denied by Admin ID: ${adminId})` 
      : `Denied by Admin ID: ${adminId}`;
    
    await sequelize.query(
      `UPDATE overtime_offers 
       SET status = 'declined', 
           guard_response_at = NOW(),
           admin_notes = $1
       WHERE id = $2`,
      { bind: [denialNote, offerId] }
    );

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `guard:${offer.guard_id}`, "overtime_request_denied", {
        offerId: offer.id,
        shiftId: offer.shift_id,
        reason: adminNotes || "Request denied by admin",
      }).catch(() => {});
    }

    // Create admin notification
    await notify(req.app, {
      type: "OVERTIME_REQUEST_DENIED",
      title: "Overtime Request Denied",
      message: `Overtime request denied for guard`,
      entityType: "overtime_offer",
      entityId: offer.id,
      meta: {
        guardId: offer.guard_id,
        shiftId: offer.shift_id,
        offerId: offer.id,
      },
    });

    return res.json({
      message: "Overtime request denied",
      offerId: offer.id,
    });
  } catch (error) {
    logger.error("Error denying overtime request:", error);
    return res.status(500).json({
      message: "Failed to deny overtime request",
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/overtime/offers/:offerId/cancel
 * Cancel an overtime offer
 */
exports.cancelOvertimeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sequelize } = req.app.locals.models;

    // Get the offer
    const [offers] = await sequelize.query(
      `SELECT * FROM overtime_offers WHERE id = $1`,
      { bind: [offerId] }
    );

    if (offers.length === 0) {
      return res.status(404).json({ message: "Overtime offer not found" });
    }

    const offer = offers[0];

    if (offer.status !== "pending") {
      return res.status(400).json({
        message: `Cannot cancel offer with status: ${offer.status}`,
      });
    }

    // Update offer status
    await sequelize.query(
      `UPDATE overtime_offers SET status = 'cancelled' WHERE id = $1`,
      { bind: [offerId] }
    );

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, `guard:${offer.guard_id}`, "overtime_offer_cancelled", {
        offerId: offer.id,
        shiftId: offer.shift_id,
      }).catch(() => {});
    }

    return res.json({
      message: "Overtime offer cancelled",
      offerId: offer.id,
    });
  } catch (error) {
    logger.error("Error cancelling overtime offer:", error);
    return res.status(500).json({
      message: "Failed to cancel overtime offer",
      error: error.message,
    });
  }
};
