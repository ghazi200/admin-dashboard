/**
 * Schedule Email Controller
 * Handles API endpoints for schedule email preferences and sending
 */

const scheduleEmailService = require("../services/scheduleEmail.service");
const { Op } = require("sequelize");

/**
 * GET /api/admin/schedule-email/preferences
 * Get all schedule email preferences (with guard info)
 */
exports.getPreferences = async (req, res) => {
  try {
    const { sequelize, ScheduleEmailPreference, Guard } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    // Get all preferences with guard info
    const [preferences] = await sequelize.query(`
      SELECT 
        sep.*,
        g.name as guard_name,
        g.email as guard_email,
        g.id as guard_id
      FROM schedule_email_preferences sep
      JOIN guards g ON g.id = sep.guard_id
      WHERE sep.tenant_id = $1
      ORDER BY g.name ASC
    `, {
      bind: [tenantId],
    });
    
    return res.json(preferences);
  } catch (error) {
    console.error("getPreferences error:", error);
    return res.status(500).json({
      message: "Failed to get schedule email preferences",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/schedule-email/preferences/:guardId
 * Get schedule email preference for a specific guard
 */
exports.getGuardPreference = async (req, res) => {
  try {
    const { ScheduleEmailPreference, Guard } = req.app.locals.models;
    const { guardId } = req.params;
    const tenantId = req.admin?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    // Get or create preference
    let preference = await ScheduleEmailPreference.findOne({
      where: { guard_id: guardId, tenant_id: tenantId },
      raw: true,
    });
    
    if (!preference) {
      // Create default preference
      preference = await ScheduleEmailPreference.create({
        guard_id: guardId,
        tenant_id: tenantId,
        frequency: "weekly",
        day_of_week: 1, // Monday
        preferred_time: "09:00:00",
        is_active: true,
      });
    }
    
    // Get guard info
    const guard = await Guard.findByPk(guardId, { raw: true });
    
    return res.json({
      ...preference,
      guard_name: guard?.name,
      guard_email: guard?.email,
    });
  } catch (error) {
    console.error("getGuardPreference error:", error);
    return res.status(500).json({
      message: "Failed to get guard preference",
      error: error.message,
    });
  }
};

/**
 * PUT /api/admin/schedule-email/preferences/:guardId
 * Update schedule email preference for a guard
 */
exports.updatePreference = async (req, res) => {
  try {
    const { ScheduleEmailPreference } = req.app.locals.models;
    const { guardId } = req.params;
    const tenantId = req.admin?.tenant_id;
    const { frequency, day_of_week, day_of_month, preferred_time, is_active } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    // Find or create preference
    let preference = await ScheduleEmailPreference.findOne({
      where: { guard_id: guardId, tenant_id: tenantId },
    });
    
    const updateData = {
      frequency: frequency || "weekly",
      preferred_time: preferred_time || "09:00:00",
      is_active: is_active !== undefined ? is_active : true,
      updated_at: new Date(),
    };
    
    if (day_of_week !== undefined) updateData.day_of_week = day_of_week;
    if (day_of_month !== undefined) updateData.day_of_month = day_of_month;
    
    if (preference) {
      await preference.update(updateData);
    } else {
      preference = await ScheduleEmailPreference.create({
        guard_id: guardId,
        tenant_id: tenantId,
        ...updateData,
      });
    }
    
    return res.json(preference);
  } catch (error) {
    console.error("updatePreference error:", error);
    return res.status(500).json({
      message: "Failed to update preference",
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/schedule-email/send-now/:guardId
 * Manually send schedule email to a guard
 */
exports.sendNow = async (req, res) => {
  try {
    const { Guard } = req.app.locals.models;
    const { guardId } = req.params;
    const { startDate, endDate } = req.body;
    const tenantId = req.admin?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    // Get guard
    const guard = await Guard.findByPk(guardId, { raw: true });
    if (!guard || guard.tenant_id !== tenantId) {
      return res.status(404).json({ message: "Guard not found" });
    }
    
    if (!guard.email) {
      return res.status(400).json({ message: "Guard has no email address" });
    }
    
    // Calculate date range
    const now = new Date();
    const periodStart = startDate 
      ? new Date(startDate) 
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodEnd = endDate 
      ? new Date(endDate) 
      : new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 7); // Default to 7 days
    
    // Get shifts
    const shifts = await scheduleEmailService.generateGuardSchedule(
      guardId,
      periodStart.toISOString().split("T")[0],
      periodEnd.toISOString().split("T")[0],
      req.app.locals.models
    );
    
    // Format schedule data
    const scheduleData = scheduleEmailService.formatScheduleForEmail(guard, shifts, {
      startDate: periodStart.toISOString().split("T")[0],
      endDate: periodEnd.toISOString().split("T")[0],
    });
    
    // Send email
    const result = await scheduleEmailService.sendScheduleEmail(
      guard,
      scheduleData,
      req.app.locals.models
    );
    
    if (result.success) {
      return res.json({
        success: true,
        message: "Schedule email sent successfully",
        messageId: result.messageId,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to send schedule email",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("sendNow error:", error);
    return res.status(500).json({
      message: "Failed to send schedule email",
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/schedule-email/bulk-send
 * Send schedule emails to multiple guards
 */
exports.bulkSend = async (req, res) => {
  try {
    const { guardIds, startDate, endDate } = req.body;
    const tenantId = req.admin?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    if (!Array.isArray(guardIds) || guardIds.length === 0) {
      return res.status(400).json({ message: "guardIds array required" });
    }
    
    const { Guard } = req.app.locals.models;
    const results = [];
    
    for (const guardId of guardIds) {
      try {
        const guard = await Guard.findByPk(guardId, { raw: true });
        if (!guard || guard.tenant_id !== tenantId || !guard.email) {
          results.push({ guardId, success: false, error: "Guard not found or no email" });
          continue;
        }
        
        // Calculate date range
        const now = new Date();
        const periodStart = startDate 
          ? new Date(startDate) 
          : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodEnd = endDate 
          ? new Date(endDate) 
          : new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 7);
        
        // Get shifts
        const shifts = await scheduleEmailService.generateGuardSchedule(
          guardId,
          periodStart.toISOString().split("T")[0],
          periodEnd.toISOString().split("T")[0],
          req.app.locals.models
        );
        
        // Format and send
        const scheduleData = scheduleEmailService.formatScheduleForEmail(guard, shifts, {
          startDate: periodStart.toISOString().split("T")[0],
          endDate: periodEnd.toISOString().split("T")[0],
        });
        
        const result = await scheduleEmailService.sendScheduleEmail(
          guard,
          scheduleData,
          req.app.locals.models
        );
        
        results.push({
          guardId,
          guardName: guard.name,
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        results.push({ guardId, success: false, error: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    return res.json({
      total: results.length,
      success: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error("bulkSend error:", error);
    return res.status(500).json({
      message: "Failed to send bulk emails",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/schedule-email/logs
 * Get email history/logs
 */
exports.getLogs = async (req, res) => {
  try {
    const { sequelize, ScheduleEmailLog } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const { guardId, limit = 50, offset = 0 } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID required" });
    }
    
    let whereClause = "WHERE sel.tenant_id = $1";
    const bindParams = [tenantId];
    
    if (guardId) {
      whereClause += " AND sel.guard_id = $2";
      bindParams.push(guardId);
    }
    
    const [logs] = await sequelize.query(`
      SELECT 
        sel.*,
        g.name as guard_name,
        g.email as guard_email
      FROM schedule_email_logs sel
      JOIN guards g ON g.id = sel.guard_id
      ${whereClause}
      ORDER BY sel.email_sent_at DESC
      LIMIT $${bindParams.length + 1}
      OFFSET $${bindParams.length + 2}
    `, {
      bind: [...bindParams, parseInt(limit), parseInt(offset)],
    });
    
    // Get total count
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM schedule_email_logs sel
      ${whereClause}
    `, {
      bind: bindParams,
    });
    
    return res.json({
      logs,
      total: parseInt(countResult[0]?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("getLogs error:", error);
    return res.status(500).json({
      message: "Failed to get email logs",
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/schedule-email/process
 * Manually trigger scheduled email processing (for testing/admin use)
 */
exports.processScheduled = async (req, res) => {
  try {
    const result = await scheduleEmailService.processScheduledEmails(req.app.locals.models);
    return res.json({
      success: true,
      message: "Scheduled email processing completed",
      ...result,
    });
  } catch (error) {
    console.error("processScheduled error:", error);
    return res.status(500).json({
      message: "Failed to process scheduled emails",
      error: error.message,
    });
  }
};
