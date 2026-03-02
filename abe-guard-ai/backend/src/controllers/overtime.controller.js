/**
 * Overtime Controller
 * Handles overtime status and overtime offer responses for guards
 */
const overtimeStatusService = require("../services/overtimeStatus.service");
const { pool } = require("../config/db");

/**
 * GET /api/guard/overtime/status/:shiftId
 * Get real-time overtime status for a shift
 */
exports.getOvertimeStatus = async (req, res) => {
  try {
    const { shiftId } = req.params;
    const guardId = req.user?.guardId || req.guard?.id;

    if (!shiftId) {
      return res.status(400).json({ message: "Missing shiftId" });
    }

    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity" });
    }

    const models = req.app.locals.models;
    const status = await overtimeStatusService.getOvertimeStatus(
      models,
      guardId,
      shiftId
    );

    return res.json(status);
  } catch (error) {
    console.error("Error getting overtime status:", error);
    return res.status(500).json({
      message: "Failed to get overtime status",
      error: error.message,
    });
  }
};

/**
 * GET /api/guard/overtime/offers
 * Get pending overtime offers for the guard
 */
exports.getOvertimeOffers = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.guard?.id;

    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity" });
    }

    const offersResult = await pool.query(
      `
      SELECT 
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
      WHERE oo.guard_id = $1
        AND oo.status IN ('pending', 'requested')
        AND (oo.expires_at IS NULL OR oo.expires_at > NOW())
      ORDER BY oo.created_at DESC
      LIMIT 10
      `,
      [guardId]
    );

    const offers = offersResult.rows || offersResult;

    return res.json({ data: offers });
  } catch (error) {
    console.error("Error getting overtime offers:", error);
    return res.status(500).json({
      message: "Failed to get overtime offers",
      error: error.message,
    });
  }
};

/**
 * POST /api/guard/overtime/offers/:offerId/accept
 * Accept an overtime offer
 */
exports.acceptOvertimeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const guardId = req.user?.guardId || req.guard?.id || req.user?.id;

    console.log("Accepting overtime offer:", { offerId, guardId, user: req.user, guard: req.guard });

    if (!guardId) {
      console.error("Missing guard identity:", { user: req.user, guard: req.guard });
      return res.status(401).json({ message: "Missing guard identity" });
    }

    // Get database connection (use sequelize if available, otherwise pool)
    const { sequelize } = req.app.locals.models || {};
    const db = sequelize || pool;

    // Get the offer
    let offers;
    if (sequelize) {
      const [result] = await sequelize.query(
        `SELECT * FROM overtime_offers WHERE id = $1::uuid AND guard_id = $2::uuid`,
        { bind: [offerId, guardId] }
      );
      offers = result;
    } else {
      const offersResult = await pool.query(
        `SELECT * FROM overtime_offers WHERE id = $1::uuid AND guard_id = $2::uuid`,
        [offerId, guardId]
      );
      offers = offersResult.rows || offersResult;
    }

    if (offers.length === 0) {
      console.error("Overtime offer not found:", { offerId, guardId });
      return res.status(404).json({ message: "Overtime offer not found" });
    }

    const offer = offers[0];
    console.log("Found offer:", { 
      id: offer.id, 
      status: offer.status, 
      guard_id: offer.guard_id,
      shift_id: offer.shift_id,
      proposed_end_time: offer.proposed_end_time,
      current_end_time: offer.current_end_time,
      extension_hours: offer.extension_hours
    });
    
    // Verify the shift_id matches the guard's current clocked-in shift
    const timeEntryResult = await pool.query(
      `SELECT shift_id, clock_in_at, clock_out_at 
       FROM time_entries 
       WHERE guard_id = $1 
         AND clock_out_at IS NULL 
       ORDER BY clock_in_at DESC 
       LIMIT 1`,
      [guardId]
    );
    
    const currentTimeEntry = timeEntryResult.rows?.[0] || timeEntryResult[0];
    if (currentTimeEntry && currentTimeEntry.shift_id !== offer.shift_id) {
      console.warn("⚠️ Shift ID mismatch:", {
        offerShiftId: offer.shift_id,
        currentClockInShiftId: currentTimeEntry.shift_id,
        note: "Guard is clocked into a different shift than the overtime offer"
      });
    }

    // Allow accepting both "pending" (admin-initiated) and "requested" (guard-initiated) offers
    // But not "accepted", "declined", or "cancelled"
    if (offer.status !== "pending" && offer.status !== "requested") {
      return res.status(400).json({
        message: `Cannot accept offer with status: ${offer.status}. Offer is already ${offer.status}.`,
      });
    }

    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      return res.status(400).json({ message: "Offer has expired" });
    }

    // Update offer status - this is the critical operation
    // Use the same simple approach as decline endpoint
    await pool.query(
      `UPDATE overtime_offers 
       SET status = 'accepted', guard_response_at = NOW() 
       WHERE id = $1::uuid`,
      [offerId]
    );

    console.log("✅ Overtime offer status updated to 'accepted'");

    // Extend shift end time - extract time from proposed_end_time
    // shift_end column is TIME type, so we need HH:MM:SS format
    // This is optional - if it fails, the offer is still accepted
    try {
      // Get the shift to understand the timezone context
      const shiftResult = await pool.query(
        `SELECT shift_date, shift_start, shift_end FROM shifts WHERE id = $1`,
        [offer.shift_id]
      );
      
      if (shiftResult.rows && shiftResult.rows.length > 0) {
        const shift = shiftResult.rows[0];
        const shiftDate = shift.shift_date instanceof Date 
          ? shift.shift_date.toISOString().split('T')[0]
          : String(shift.shift_date).split('T')[0];
        
        // proposed_end_time is stored as ISO string (UTC)
        // shift_end is TIME type (HH:MM:SS) - represents local time
        // The frontend sends local time converted to UTC via toISOString()
        // We need to extract the LOCAL time that was originally selected
        
        // Parse the proposed end time (UTC ISO string)
        const proposedEndUTC = new Date(offer.proposed_end_time);
        
        // The key insight: proposed_end_time is UTC, but represents a local time moment
        // When the admin selected "11:00 PM" in the UI, it was stored as "4:00 AM UTC" (if EST, UTC-5)
        // shift_end needs to be "23:00:00" (local time), not "04:00:00" (UTC time)
        
        // FIXED: Extract EST time components from UTC timestamp
        // proposed_end_time is stored as UTC (e.g., 4:00 UTC = 11:00 PM EST previous day)
        // We need to convert it to EST to update shift_end (which is in EST)
        // Use Intl.DateTimeFormat to get EST components correctly
        const estFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        
        const estParts = estFormatter.formatToParts(proposedEndUTC);
        const hours = estParts.find(p => p.type === 'hour').value;
        const minutes = estParts.find(p => p.type === 'minute').value;
        const seconds = estParts.find(p => p.type === 'second').value;
        const shiftEndTime = `${hours}:${minutes}:${seconds}`;
        
        console.log("Updating shift end time:", { 
          shiftId: offer.shift_id, 
          shiftDate,
          proposedEndTimeISO: offer.proposed_end_time,
          proposedEndUTC: proposedEndUTC.toISOString(),
          proposedEndUTCHours: proposedEndUTC.getUTCHours(),
          shiftEndTime,
          currentShiftStart: shift.shift_start,
          currentShiftEnd: shift.shift_end,
          note: "Converted UTC to EST for shift_end update"
        });

        // Update the shift end time
        console.log("Executing shift_end UPDATE query:", {
          shiftEndTime,
          shiftId: offer.shift_id,
          query: `UPDATE shifts SET shift_end = $1::time WHERE id = $2`
        });
        
        const updateResult = await pool.query(
          `UPDATE shifts 
           SET shift_end = $1::time 
           WHERE id = $2::uuid
           RETURNING id, shift_end`,
          [shiftEndTime, offer.shift_id]
        );
        
        const updatedShift = updateResult.rows?.[0] || updateResult[0];
        console.log("✅ Shift end time updated successfully:", {
          shiftId: updatedShift?.id,
          newShiftEnd: updatedShift?.shift_end,
          rowCount: updateResult.rowCount || (updateResult.rows ? updateResult.rows.length : 0)
        });
        
        if (!updatedShift || (updateResult.rowCount === 0 && (!updateResult.rows || updateResult.rows.length === 0))) {
          console.warn("⚠️ UPDATE query returned no rows - shift may not exist or ID mismatch");
        }
      } else {
        console.warn("⚠️ Shift not found, skipping shift_end update");
      }
    } catch (shiftError) {
      console.error("⚠️ Error updating shift end time (non-fatal):", shiftError.message);
      console.error("   Error details:", shiftError);
      // Continue - shift update is optional, offer acceptance succeeded
    }

    // Update time entry if exists (extend clock_out_at if not set)
    // This is optional - if it fails, the offer is still accepted
    try {
      await pool.query(
        `UPDATE time_entries 
         SET clock_out_at = $1 
         WHERE shift_id = $2 
           AND guard_id = $3 
           AND clock_out_at IS NULL`,
        [offer.proposed_end_time, offer.shift_id, guardId]
      );
      console.log("✅ Time entry updated successfully");
    } catch (timeEntryError) {
      console.error("⚠️ Error updating time entry (non-fatal):", timeEntryError.message);
      // Continue - time entry update is optional
    }

    // Emit socket events to notify admin and guard
    const io = req.app.locals.io;
    if (io) {
      // Notify admins
      io.to("admins").emit("overtime_offer_accepted", {
        offerId: offer.id,
        guardId,
        shiftId: offer.shift_id,
        proposedEndTime: offer.proposed_end_time,
      });
      
      // Notify the guard that their shift was updated
      io.to(`guard:${guardId}`).emit("shift_updated", {
        shiftId: offer.shift_id,
        shiftEnd: updatedShift?.shift_end || shiftEndTime,
        message: "Your shift end time has been extended due to overtime acceptance",
      });
    }

    return res.json({
      message: "Overtime offer accepted",
      offerId: offer.id,
      shiftId: offer.shift_id,
    });
  } catch (error) {
    console.error("Error accepting overtime offer:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
    });
    return res.status(500).json({
      message: "Failed to accept overtime offer",
      error: error.message,
      detail: error.detail || null,
      constraint: error.constraint || null,
    });
  }
};

/**
 * POST /api/guard/overtime/request
 * Request overtime (guard-initiated)
 */
exports.requestOvertime = async (req, res) => {
  try {
    console.log("📝 Overtime request received:", req.body);
    const { shiftId, proposedEndTime, extensionHours, reason } = req.body;
    const guardId = req.user?.guardId || req.guard?.id;

    console.log("📝 Request details:", { shiftId, proposedEndTime, extensionHours, guardId });

    if (!guardId) {
      console.error("❌ Missing guard identity");
      return res.status(401).json({ message: "Missing guard identity" });
    }

    if (!shiftId || !proposedEndTime || !extensionHours) {
      console.error("❌ Missing required fields:", { shiftId, proposedEndTime, extensionHours });
      return res.status(400).json({
        message: "Missing required fields: shiftId, proposedEndTime, extensionHours",
      });
    }

    // Get shift details
    const shiftResult = await pool.query(
      `SELECT shift_date, shift_end FROM shifts WHERE id = $1`,
      [shiftId]
    );
    const shifts = shiftResult.rows || shiftResult;

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];
    
    // Parse current end time safely - FIXED: Use direct UTC calculation like admin-dashboard
    let currentEndTime;
    if (shift.shift_date && shift.shift_end) {
      try {
        // Parse date and time components
        let dateStr;
        if (typeof shift.shift_date === 'string') {
          dateStr = shift.shift_date.split('T')[0].split(' ')[0];
        } else if (shift.shift_date instanceof Date) {
          dateStr = shift.shift_date.toISOString().split('T')[0];
        } else {
          dateStr = String(shift.shift_date).split('T')[0].split(' ')[0];
        }
        
        const timeStr = String(shift.shift_end).trim().split('.')[0]; // Remove milliseconds if present
        const dateParts = dateStr.split('-');
        const timeParts = timeStr.split(':');
        
        const year = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
        const day = parseInt(dateParts[2], 10);
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        const seconds = parseInt(timeParts[2] || '0', 10);
        
        // Validate hours
        if (hours < 0 || hours > 23) {
          console.error("❌ INVALID HOURS:", hours, "from shift_end:", timeStr);
          return res.status(400).json({
            message: `Invalid shift end time format. Hours: ${hours} (must be 0-23)`,
          });
        }
        
        // FIXED: Calculate UTC time directly (EST is UTC-5, EDT is UTC-4)
        // For simplicity, use EST offset (UTC-5) - can be enhanced for DST later
        const utcHours = hours + 5;
        let utcDay = day;
        let utcMonth = month;
        let utcYear = year;
        
        // Handle day/month/year rollover if UTC hours >= 24
        if (utcHours >= 24) {
          const extraDays = Math.floor(utcHours / 24);
          utcDay += extraDays;
          const utcHoursAdjusted = utcHours % 24;
          
          // Handle month rollover
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          if (utcDay > daysInMonth) {
            utcDay = utcDay - daysInMonth;
            utcMonth += 1;
            if (utcMonth >= 12) {
              utcMonth = 0;
              utcYear += 1;
            }
          }
          
          // Create UTC date with adjusted values
          currentEndTime = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHoursAdjusted, minutes, seconds));
        } else {
          // No rollover needed
          currentEndTime = new Date(Date.UTC(year, month, day, utcHours, minutes, seconds));
        }
        
        console.log("✅ Current end time calculated (UTC):", {
          shift_date: dateStr,
          shift_end: timeStr,
          localHours: hours,
          utcHours: currentEndTime.getUTCHours(),
          utcISO: currentEndTime.toISOString(),
          note: `shift_end ${timeStr} (${hours}:00 EST) = ${currentEndTime.getUTCHours()}:00 UTC`
        });
      } catch (error) {
        console.error("❌ Error calculating currentEndTime:", error);
        return res.status(400).json({
          message: `Invalid shift end time format. Date: ${shift.shift_date}, Time: ${shift.shift_end}`,
        });
      }
    } else {
      // Fallback to current time if shift end not set
      console.log("⚠️ Shift end time not set, using current time");
      currentEndTime = new Date();
    }
    
    console.log("✅ Current end time parsed:", currentEndTime.toISOString());

    // Validate proposed end time
    const proposedEnd = new Date(proposedEndTime);
    console.log("📝 Proposed end time:", proposedEndTime, "→", proposedEnd.toISOString());
    
    if (isNaN(proposedEnd.getTime())) {
      console.error("❌ Invalid proposed end time:", proposedEndTime);
      return res.status(400).json({
        message: `Invalid proposed end time format: ${proposedEndTime}`,
      });
    }
    
    if (proposedEnd <= currentEndTime) {
      console.error("❌ Proposed end time not after current:", { proposed: proposedEnd.toISOString(), current: currentEndTime.toISOString() });
      return res.status(400).json({
        message: `Proposed end time (${proposedEnd.toISOString()}) must be after current shift end time (${currentEndTime.toISOString()})`,
      });
    }

    // Calculate expiration (24 hours from now for requests)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create overtime request (status: 'requested' instead of 'pending')
    // Convert dates to ISO strings for database
    const proposedEndISO = proposedEnd.toISOString();
    const currentEndISO = currentEndTime.toISOString();
    const expiresAtISO = expiresAt.toISOString();

    console.log("📝 Inserting overtime request:", {
      guardId,
      shiftId,
      proposedEndISO,
      currentEndISO,
      extensionHours,
      expiresAtISO,
    });

    const requestResult = await pool.query(
      `INSERT INTO overtime_offers 
       (guard_id, shift_id, admin_id, proposed_end_time, current_end_time, extension_hours, reason, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, NOW())
       RETURNING id, guard_id, shift_id, proposed_end_time, extension_hours, status, created_at`,
      [
        guardId,
        shiftId,
        null, // No admin_id for guard-initiated requests
        proposedEndISO,
        currentEndISO,
        extensionHours,
        reason || null,
        expiresAtISO,
      ]
    );
    
    console.log("✅ Overtime request inserted successfully");

    const request = (requestResult.rows || requestResult)[0];

    // Emit socket event to notify admins
    const io = req.app.locals.io;
    if (io) {
      io.to("admins").emit("overtime_request", {
        requestId: request.id,
        guardId,
        shiftId,
        proposedEndTime: request.proposed_end_time,
        extensionHours: request.extension_hours,
        reason: request.reason,
      });
    }

    return res.json({
      message: "Overtime request submitted",
      data: request,
    });
  } catch (error) {
    console.error("❌ Error requesting overtime:", error);
    console.error("   Error details:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
    });
    return res.status(500).json({
      message: "Failed to request overtime",
      error: error.message,
      detail: error.detail || null,
    });
  }
};

/**
 * POST /api/guard/overtime/offers/:offerId/decline
 * Decline an overtime offer
 */
exports.declineOvertimeOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const guardId = req.user?.guardId || req.guard?.id;

    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity" });
    }

    // Get the offer
    // Note: pool.query handles UUID parameters correctly without explicit casting
    const offersResult = await pool.query(
      `SELECT * FROM overtime_offers WHERE id = $1::uuid AND guard_id = $2::uuid`,
      [offerId, guardId]
    );

    const offers = offersResult.rows || offersResult;
    if (offers.length === 0) {
      return res.status(404).json({ message: "Overtime offer not found" });
    }

    const offer = offers[0];

    // Allow declining both "pending" and "requested" status offers
    // But not "accepted", "declined", or "cancelled"
    if (offer.status !== "pending" && offer.status !== "requested") {
      return res.status(400).json({
        message: `Cannot decline offer with status: ${offer.status}. Offer is already ${offer.status}.`,
      });
    }

    // Update offer status
    await pool.query(
      `UPDATE overtime_offers 
       SET status = 'declined', guard_response_at = NOW() 
       WHERE id = $1::uuid`,
      [offerId]
    );

    // Emit socket event to notify admin
    const io = req.app.locals.io;
    if (io) {
      io.to("admins").emit("overtime_offer_declined", {
        offerId: offer.id,
        guardId,
        shiftId: offer.shift_id,
      });
    }

    return res.json({
      message: "Overtime offer declined",
      offerId: offer.id,
    });
  } catch (error) {
    console.error("Error declining overtime offer:", error);
    return res.status(500).json({
      message: "Failed to decline overtime offer",
      error: error.message,
    });
  }
};
