/**
 * Schedule Email Service
 * Handles sending schedule emails to guards
 */

const emailService = require("./email.service");
const scheduleEmailTemplate = require("./scheduleEmailTemplate.service");
const { Op } = require("sequelize");

/**
 * Generate shifts from schedule template for a guard
 * This is used when there are no actual shifts but we want to email the template schedule
 */
async function generateShiftsFromTemplate(guardName, startDate, endDate, models) {
  try {
    const { ScheduleConfig, Guard, sequelize } = models;
    const tenantId = null; // Could be passed as parameter if needed
    
    // Get schedule config
    const scheduleConfig = await ScheduleConfig.findOne({
      where: {
        buildingId: "BLD-001",
        ...(tenantId ? { tenantId } : { tenantId: null }),
      },
      order: [["createdAt", "DESC"]],
    });
    
    if (!scheduleConfig || !scheduleConfig.scheduleTemplate) {
      return [];
    }
    
    // Find guard by name
    const guard = await Guard.findOne({
      where: {
        name: guardName,
      },
    });
    
    if (!guard) {
      return [];
    }
    
    // Get current week's dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const weekDates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      weekDates.push(d.toISOString().split('T')[0]);
    }
    
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const template = scheduleConfig.scheduleTemplate || [];
    
    // Generate shifts from template
    const shifts = [];
    
    // Create a map of dates to day names
    const dateToDayMap = new Map();
    weekDates.forEach((date, idx) => {
      const d = new Date(date);
      const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayName = dayNames[dayOfWeek === 0 ? 6 : dayOfWeek - 1]; // Convert to Monday = 0
      dateToDayMap.set(date, dayName);
    });
    
    template.forEach((templateDay) => {
      // Find all dates that match this day of week
      weekDates.forEach((date) => {
        const dayName = dateToDayMap.get(date);
        if (templateDay.day === dayName) {
      
          templateDay.shifts?.forEach((shiftTemplate) => {
            if (shiftTemplate.scheduledGuard === guardName) {
              shifts.push({
                id: `template-${date}-${shiftTemplate.id}`,
                guard_id: guard.id,
                shift_date: date,
                shift_start: shiftTemplate.start,
                shift_end: shiftTemplate.end,
                status: "OPEN", // Template shifts are open until assigned
                location: scheduleConfig.buildingLocation || scheduleConfig.buildingName || "Main Office Building",
                tenant_id: guard.tenant_id || null,
                created_at: new Date(),
                is_template: true, // Flag to indicate this is from template
              });
            }
          });
        }
      });
    });
    
    return shifts;
  } catch (error) {
    console.error(`Error generating template shifts for guard ${guardName}:`, error);
    return [];
  }
}

/**
 * Get all shifts for a guard within a date range
 * Falls back to template-based schedule if no actual shifts exist
 */
async function generateGuardSchedule(guardId, startDate, endDate, models) {
  try {
    const { Shift, Guard } = models;
    
    // First, try to get actual shifts
    const shifts = await Shift.findAll({
      where: {
        guard_id: guardId,
        shift_date: {
          [Op.gte]: startDate,
          [Op.lte]: endDate,
        },
        status: {
          [Op.in]: ["CLOSED", "OPEN"], // Include both assigned and open shifts
        },
      },
      order: [["shift_date", "ASC"], ["shift_start", "ASC"]],
      raw: true,
    });
    
    // If no actual shifts found, try to generate from template
    if (shifts.length === 0) {
      const guard = await Guard.findByPk(guardId);
      if (guard && guard.name) {
        const templateShifts = await generateShiftsFromTemplate(
          guard.name,
          startDate,
          endDate,
          models
        );
        return templateShifts;
      }
    }
    
    return shifts;
  } catch (error) {
    console.error(`Error generating schedule for guard ${guardId}:`, error);
    return [];
  }
}

/**
 * Format schedule data for email
 */
function formatScheduleForEmail(guard, shifts, period) {
  return {
    guard,
    shifts,
    period,
    summary: {
      totalShifts: shifts.length,
      totalHours: scheduleEmailTemplate.calculateTotalHours(shifts),
    },
  };
}

/**
 * Send schedule email to a guard
 */
async function sendScheduleEmail(guard, scheduleData, models) {
  try {
    const { ScheduleEmailLog } = models;
    const { shifts, period } = scheduleData;
    
    // Generate email templates
    const html = scheduleEmailTemplate.generateHTMLTemplate(
      guard,
      shifts,
      period
    );
    const text = scheduleEmailTemplate.generateTextTemplate(
      guard,
      shifts,
      period
    );
    
    // Generate subject
    const startDateFormatted = scheduleEmailTemplate.formatDate(period.startDate);
    const endDateFormatted = scheduleEmailTemplate.formatDate(period.endDate);
    const subject = `Your Schedule: ${startDateFormatted} to ${endDateFormatted}`;
    
    // Send email
    const emailResult = await emailService.sendReportEmail({
      to: guard.email,
      subject: subject,
      html: html,
      text: text,
    });
    
    // Log the email
    if (emailResult.success) {
      await ScheduleEmailLog.create({
        guard_id: guard.id,
        tenant_id: guard.tenant_id,
        email_sent_at: new Date(),
        schedule_period_start: period.startDate,
        schedule_period_end: period.endDate,
        shifts_count: shifts.length,
        email_status: "sent",
        email_subject: subject,
        email_to: guard.email,
      });
      
      console.log(`✅ Schedule email sent to ${guard.name} (${guard.email})`);
      return { success: true, messageId: emailResult.messageId };
    } else {
      // Log failure
      await ScheduleEmailLog.create({
        guard_id: guard.id,
        tenant_id: guard.tenant_id,
        email_sent_at: new Date(),
        schedule_period_start: period.startDate,
        schedule_period_end: period.endDate,
        shifts_count: shifts.length,
        email_status: "failed",
        error_message: emailResult.error || "Unknown error",
        email_subject: subject,
        email_to: guard.email,
      });
      
      console.error(`❌ Failed to send schedule email to ${guard.name}:`, emailResult.error);
      return { success: false, error: emailResult.error };
    }
  } catch (error) {
    console.error(`❌ Error sending schedule email to ${guard.name}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate next send date based on frequency
 */
function calculateNextSendDate(frequency, lastSent, dayOfWeek = 1, preferredTime = "09:00") {
  const now = new Date();
  const nextDate = new Date(now);
  
  // Set time
  const [hours, minutes] = preferredTime.split(":");
  nextDate.setHours(parseInt(hours) || 9, parseInt(minutes) || 0, 0, 0);
  
  if (frequency === "weekly") {
    // Find next occurrence of dayOfWeek (0=Sunday, 1=Monday, etc.)
    const currentDay = now.getDay();
    let daysUntilNext = (dayOfWeek - currentDay + 7) % 7;
    
    // If it's the same day but past the time, schedule for next week
    if (daysUntilNext === 0 && now.getHours() >= parseInt(hours || 9)) {
      daysUntilNext = 7;
    }
    
    // If no day specified, default to Monday
    if (dayOfWeek === null || dayOfWeek === undefined) {
      daysUntilNext = (1 - currentDay + 7) % 7;
      if (daysUntilNext === 0 && now.getHours() >= parseInt(hours || 9)) {
        daysUntilNext = 7;
      }
    }
    
    nextDate.setDate(now.getDate() + daysUntilNext);
  } else if (frequency === "bi-weekly") {
    // Every other week on the specified day
    const currentDay = now.getDay();
    let daysUntilNext = (dayOfWeek - currentDay + 7) % 7;
    
    if (daysUntilNext === 0) {
      // Same day - check if we should send this week or next
      if (lastSent) {
        const daysSinceLastSent = Math.floor((now - new Date(lastSent)) / (1000 * 60 * 60 * 24));
        if (daysSinceLastSent < 14) {
          daysUntilNext = 14; // Send in 2 weeks
        }
      } else {
        // Never sent - send this week if time hasn't passed
        if (now.getHours() >= parseInt(hours || 9)) {
          daysUntilNext = 14;
        }
      }
    } else {
      // Different day - find next occurrence
      if (lastSent) {
        const daysSinceLastSent = Math.floor((now - new Date(lastSent)) / (1000 * 60 * 60 * 24));
        if (daysSinceLastSent < 14) {
          // Add 14 days from last sent
          const lastSentDate = new Date(lastSent);
          lastSentDate.setDate(lastSentDate.getDate() + 14);
          return lastSentDate;
        }
      }
    }
    
    nextDate.setDate(now.getDate() + daysUntilNext);
  } else if (frequency === "monthly") {
    // First of the month or specified day
    const dayOfMonth = dayOfWeek || 1; // Use dayOfWeek as dayOfMonth for monthly
    nextDate.setDate(dayOfMonth);
    nextDate.setMonth(now.getMonth() + 1);
  }
  
  return nextDate;
}

/**
 * Check if it's time to send email based on frequency and last sent date
 */
function shouldSendEmail(preference, now = new Date()) {
  if (!preference.is_active || preference.frequency === "never") {
    return false;
  }
  
  if (!preference.last_sent_at) {
    // Never sent - send now if it's the right day/time
    return true;
  }
  
  const lastSent = new Date(preference.last_sent_at);
  const daysSinceLastSent = Math.floor((now - lastSent) / (1000 * 60 * 60 * 24));
  
  if (preference.frequency === "weekly") {
    return daysSinceLastSent >= 7;
  } else if (preference.frequency === "bi-weekly") {
    return daysSinceLastSent >= 14;
  } else if (preference.frequency === "monthly") {
    return daysSinceLastSent >= 28;
  }
  
  return false;
}

/**
 * Process all scheduled emails that are due
 */
async function processScheduledEmails(models) {
  try {
    const { ScheduleEmailPreference, Guard, sequelize } = models;
    const now = new Date();
    
    // Get all active preferences
    const [preferences] = await sequelize.query(`
      SELECT * FROM schedule_email_preferences
      WHERE is_active = TRUE
        AND frequency != 'never'
      ORDER BY guard_id
    `);
    
    console.log(`📧 Checking ${preferences.length} guard email preferences...`);
    
    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const pref of preferences) {
      try {
        // Check if it's time to send
        if (!shouldSendEmail(pref, now)) {
          skippedCount++;
          continue;
        }
        
        // Get guard
        const guard = await Guard.findByPk(pref.guard_id, { raw: true });
        if (!guard || !guard.email) {
          console.warn(`⚠️  Guard ${pref.guard_id} not found or has no email`);
          skippedCount++;
          continue;
        }
        
        // Calculate date range based on frequency
        let startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        
        let endDate = new Date(startDate);
        if (pref.frequency === "weekly") {
          endDate.setDate(startDate.getDate() + 7);
        } else if (pref.frequency === "bi-weekly") {
          endDate.setDate(startDate.getDate() + 14);
        } else if (pref.frequency === "monthly") {
          endDate.setMonth(startDate.getMonth() + 1);
        }
        
        // Get shifts
        const shifts = await generateGuardSchedule(
          guard.id,
          startDate.toISOString().split("T")[0],
          endDate.toISOString().split("T")[0],
          models
        );
        
        // Format schedule data
        const scheduleData = formatScheduleForEmail(guard, shifts, {
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        });
        
        // Send email
        const result = await sendScheduleEmail(guard, scheduleData, models);
        
        if (result.success) {
          // Update last_sent_at
          await sequelize.query(`
            UPDATE schedule_email_preferences
            SET last_sent_at = $1, updated_at = NOW()
            WHERE id = $2
          `, {
            bind: [now, pref.id],
          });
          
          sentCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing email for preference ${pref.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`✅ Schedule email processing complete: ${sentCount} sent, ${skippedCount} skipped, ${errorCount} errors`);
    
    return {
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      total: preferences.length,
    };
  } catch (error) {
    console.error("❌ Error in processScheduledEmails:", error);
    throw error;
  }
}

module.exports = {
  generateGuardSchedule,
  formatScheduleForEmail,
  sendScheduleEmail,
  calculateNextSendDate,
  shouldSendEmail,
  processScheduledEmails,
};
