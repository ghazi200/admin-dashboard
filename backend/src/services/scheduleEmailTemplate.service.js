/**
 * Schedule Email Template Service
 * Generates HTML and text email templates for guard schedules
 */

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

/**
 * Format time for display (e.g., "7:00 AM")
 */
function formatTime(timeStr) {
  if (!timeStr) return "N/A";
  // Handle both "07:00:00" and "7:00 AM" formats
  if (timeStr.includes("AM") || timeStr.includes("PM")) {
    return timeStr;
  }
  
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes || "00"} ${ampm}`;
}

/**
 * Calculate total hours from shifts
 */
function calculateTotalHours(shifts) {
  let totalMinutes = 0;
  
  shifts.forEach((shift) => {
    if (shift.shift_start && shift.shift_end) {
      const start = parseTime(shift.shift_start);
      const end = parseTime(shift.shift_end);
      if (start && end) {
        // Handle overnight shifts
        let diff = end - start;
        if (diff < 0) {
          diff += 24 * 60; // Add 24 hours for overnight
        }
        totalMinutes += diff;
      }
    }
  });
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}

/**
 * Parse time string to minutes since midnight
 */
function parseTime(timeStr) {
  if (!timeStr) return null;
  
  // Handle "07:00:00" format
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  
  // Handle "7:00 AM" format
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  }
  
  return null;
}

/**
 * Generate HTML email template
 */
function generateHTMLTemplate(guard, shifts, period) {
  const { startDate, endDate } = period;
  const startDateFormatted = formatDate(startDate);
  const endDateFormatted = formatDate(endDate);
  const { hours, minutes } = calculateTotalHours(shifts);
  const totalHoursText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  
  // Group shifts by date
  const shiftsByDate = {};
  shifts.forEach((shift) => {
    const dateKey = shift.shift_date || shift.shiftDate;
    if (!shiftsByDate[dateKey]) {
      shiftsByDate[dateKey] = [];
    }
    shiftsByDate[dateKey].push(shift);
  });
  
  // Sort dates
  const sortedDates = Object.keys(shiftsByDate).sort();
  
  // Generate shift rows
  let shiftRowsHTML = "";
  if (sortedDates.length === 0) {
    shiftRowsHTML = `
      <tr>
        <td colspan="4" style="padding: 20px; text-align: center; color: #666;">
          No shifts scheduled for this period.
        </td>
      </tr>
    `;
  } else {
    sortedDates.forEach((dateKey) => {
      const dayShifts = shiftsByDate[dateKey];
      const date = new Date(dateKey);
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      const dateFormatted = formatDate(dateKey);
      
      dayShifts.forEach((shift, index) => {
        const shiftStart = formatTime(shift.shift_start || shift.shiftStart);
        const shiftEnd = formatTime(shift.shift_end || shift.shiftEnd);
        const location = shift.location || "TBD";
        const status = shift.status || "ASSIGNED";
        
        shiftRowsHTML += `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; ${index === 0 ? '' : 'border-top: none;'}">
              ${index === 0 ? `<strong>${dayName}</strong><br><span style="color: #666; font-size: 12px;">${dateFormatted}</span>` : ''}
            </td>
            <td style="padding: 12px;">
              🕐 ${shiftStart} - ${shiftEnd}
            </td>
            <td style="padding: 12px;">
              📍 ${location}
            </td>
            <td style="padding: 12px;">
              <span style="padding: 4px 8px; background: ${status === 'CLOSED' ? '#22c55e' : '#f59e0b'}; color: white; border-radius: 4px; font-size: 11px;">
                ${status}
              </span>
            </td>
          </tr>
        `;
      });
    });
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Schedule - ${startDateFormatted} to ${endDateFormatted}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 100%;">
          <!-- Header -->
          <tr>
            <td style="padding: 30px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                📅 Your Work Schedule
              </h1>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 30px 30px 20px 30px;">
              <p style="margin: 0; font-size: 16px; color: #111827; line-height: 1.6;">
                Hi <strong>${guard.name || "Guard"}</strong>,
              </p>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Your schedule for the period of <strong>${startDateFormatted}</strong> to <strong>${endDateFormatted}</strong>:
              </p>
            </td>
          </tr>
          
          <!-- Shifts Table -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">
                      Date
                    </th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">
                      Time
                    </th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">
                      Location
                    </th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; border-bottom: 2px solid #e5e7eb;">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${shiftRowsHTML}
                </tbody>
              </table>
            </td>
          </tr>
          
          <!-- Summary -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #1e40af; font-weight: 600; margin-bottom: 8px;">
                  📊 Summary
                </p>
                <p style="margin: 0; font-size: 13px; color: #1e3a8a; line-height: 1.8;">
                  • <strong>${shifts.length}</strong> shift${shifts.length !== 1 ? 's' : ''} scheduled<br>
                  • <strong>${totalHoursText}</strong> total hours
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px 30px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
                If you have any questions about your schedule, please contact your supervisor.
              </p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #9ca3af;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email template
 */
function generateTextTemplate(guard, shifts, period) {
  const { startDate, endDate } = period;
  const startDateFormatted = formatDate(startDate);
  const endDateFormatted = formatDate(endDate);
  const { hours, minutes } = calculateTotalHours(shifts);
  const totalHoursText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  
  // Group shifts by date
  const shiftsByDate = {};
  shifts.forEach((shift) => {
    const dateKey = shift.shift_date || shift.shiftDate;
    if (!shiftsByDate[dateKey]) {
      shiftsByDate[dateKey] = [];
    }
    shiftsByDate[dateKey].push(shift);
  });
  
  // Sort dates
  const sortedDates = Object.keys(shiftsByDate).sort();
  
  let shiftRowsText = "";
  if (sortedDates.length === 0) {
    shiftRowsText = "No shifts scheduled for this period.\n";
  } else {
    sortedDates.forEach((dateKey) => {
      const dayShifts = shiftsByDate[dateKey];
      const date = new Date(dateKey);
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      const dateFormatted = formatDate(dateKey);
      
      shiftRowsText += `\n${dayName}, ${dateFormatted}:\n`;
      
      dayShifts.forEach((shift) => {
        const shiftStart = formatTime(shift.shift_start || shift.shiftStart);
        const shiftEnd = formatTime(shift.shift_end || shift.shiftEnd);
        const location = shift.location || "TBD";
        const status = shift.status || "ASSIGNED";
        
        shiftRowsText += `  - ${shiftStart} - ${shiftEnd} @ ${location} (${status})\n`;
      });
    });
  }
  
  return `
Your Work Schedule
${"=".repeat(50)}

Hi ${guard.name || "Guard"},

Your schedule for the period of ${startDateFormatted} to ${endDateFormatted}:

${shiftRowsText}

Summary:
- ${shifts.length} shift${shifts.length !== 1 ? 's' : ''} scheduled
- ${totalHoursText} total hours

If you have any questions about your schedule, please contact your supervisor.

This is an automated email. Please do not reply to this message.
  `.trim();
}

module.exports = {
  generateHTMLTemplate,
  generateTextTemplate,
  formatDate,
  formatTime,
  calculateTotalHours,
};
