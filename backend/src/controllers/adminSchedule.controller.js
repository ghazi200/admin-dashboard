/**
 * Schedule Controller
 * Returns building schedule with guard assignments
 * Dynamically updates with actual shift assignments when callouts are accepted
 */

exports.getSchedule = async (req, res) => {
  try {
    const { sequelize, ScheduleConfig } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || null;

    // Get schedule config from database
    let scheduleConfig = await ScheduleConfig.findOne({
      where: {
        buildingId: "BLD-001",
        ...(tenantId ? { tenantId } : { tenantId: null }),
      },
      order: [["createdAt", "DESC"]],
    });

    // If no config exists, create default
    if (!scheduleConfig) {
      scheduleConfig = await ScheduleConfig.create({
        buildingId: "BLD-001",
        buildingName: "Main Office Building",
        buildingLocation: "123 Main Street, City, State 12345",
        tenantId: tenantId || null,
        scheduleTemplate: [],
      });
    }

    // Building information from database
    const building = {
      id: scheduleConfig.buildingId,
      name: scheduleConfig.buildingName,
      location: scheduleConfig.buildingLocation,
    };

    // Get current week's dates (Monday to Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to get Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD format
    }

    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    // Query actual shifts for this week, including callout information
    // Also query callouts directly to catch shifts that had callouts
    let actualShifts = [];
    let calloutShifts = [];
    
    try {
      // Query shifts that are CLOSED and have assigned guards
      // Also join with callouts to see if there was a callout (to prioritize callout-accepted shifts)
      const [shiftRows] = await sequelize.query(
        `
        SELECT 
          s.id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.guard_id,
          s.status,
          c.id as callout_id,
          c.guard_id as called_out_guard_id
        FROM shifts s
        LEFT JOIN callouts c ON c.shift_id = s.id
        WHERE s.shift_date >= $1 
          AND s.shift_date <= $2
          AND s.status = 'CLOSED'
          AND s.guard_id IS NOT NULL
        ORDER BY s.shift_date, s.shift_start
        `,
        { bind: [weekDates[0], weekDates[6]] }
      );

      // Try to get guard names from guards table
      for (const shift of shiftRows) {
        try {
          const [guardRows] = await sequelize.query(
            `SELECT name, email FROM guards WHERE id = $1 LIMIT 1`,
            { bind: [shift.guard_id] }
          );
          if (guardRows && guardRows.length > 0) {
            shift.guard_name = guardRows[0].name;
            shift.guard_email = guardRows[0].email;
          } else {
            shift.guard_name = `Guard ${String(shift.guard_id).substring(0, 8)}`;
            shift.guard_email = null;
          }
        } catch (err) {
          shift.guard_name = `Guard ${String(shift.guard_id).substring(0, 8)}`;
          shift.guard_email = null;
        }
      }
      actualShifts = shiftRows;
      console.log(`📊 Found ${actualShifts.length} CLOSED shifts for week ${weekDates[0]} to ${weekDates[6]}`);
      
      // Also query callouts with their shifts to catch any shifts that had callouts
      // Expand the date range slightly to catch shifts just outside the current week
      const weekStart = new Date(weekDates[0]);
      weekStart.setDate(weekStart.getDate() - 1); // Include day before
      const weekEnd = new Date(weekDates[6]);
      weekEnd.setDate(weekEnd.getDate() + 1); // Include day after
      
      const [calloutRows] = await sequelize.query(
        `
        SELECT 
          c.id as callout_id,
          c.guard_id as called_out_guard_id,
          s.id as shift_id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.guard_id as assigned_guard_id,
          s.status
        FROM callouts c
        LEFT JOIN shifts s ON c.shift_id = s.id
        WHERE s.shift_date >= $1 
          AND s.shift_date <= $2
          AND s.status = 'CLOSED'
          AND s.guard_id IS NOT NULL
        ORDER BY s.shift_date, s.shift_start
        `,
        { bind: [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]] }
      );
      
      // Get guard names for callout shifts
      for (const callout of calloutRows) {
        try {
          const [guardRows] = await sequelize.query(
            `SELECT name, email FROM guards WHERE id = $1 LIMIT 1`,
            { bind: [callout.assigned_guard_id] }
          );
          if (guardRows && guardRows.length > 0) {
            callout.guard_name = guardRows[0].name;
            callout.guard_email = guardRows[0].email;
          } else {
            callout.guard_name = `Guard ${String(callout.assigned_guard_id).substring(0, 8)}`;
            callout.guard_email = null;
          }
        } catch (err) {
          callout.guard_name = `Guard ${String(callout.assigned_guard_id).substring(0, 8)}`;
          callout.guard_email = null;
        }
        callout.hasCallout = true; // Mark these as having callouts
      }
      calloutShifts = calloutRows;
      console.log(`📞 Found ${calloutShifts.length} callouts with CLOSED shifts for week ${weekDates[0]} to ${weekDates[6]}`);
      
    } catch (err) {
      console.warn("⚠️ Could not query shifts/callouts for schedule:", err.message);
      actualShifts = [];
      calloutShifts = [];
    }

    // Helper to normalize time (remove seconds, handle both "09:00:00" and "09:00")
    const normalizeTime = (time) => {
      if (!time) return null;
      const str = String(time);
      // Remove seconds if present: "09:00:00" -> "09:00"
      return str.substring(0, 5);
    };

    // Helper to convert time to minutes for comparison (e.g., "07:00" -> 420)
    const timeToMinutes = (time) => {
      if (!time) return null;
      const normalized = normalizeTime(time);
      const [hours, minutes] = normalized.split(':').map(Number);
      return hours * 60 + (minutes || 0);
    };

    // Create a map of shifts by date and time ranges for flexible lookup
    // Also create a date-based map for quick lookup by date only
    const shiftMap = new Map();
    const shiftsByDate = new Map(); // date -> array of shifts
    
    // Add regular shifts
    actualShifts.forEach(shift => {
      const normalizedStart = normalizeTime(shift.shift_start);
      const normalizedEnd = normalizeTime(shift.shift_end);
      const key = `${shift.shift_date}_${normalizedStart}_${normalizedEnd}`;
      
      const shiftData = {
        guardName: shift.guard_name || shift.guard_email || "Unknown Guard",
        guardId: shift.guard_id,
        startMinutes: timeToMinutes(shift.shift_start),
        endMinutes: timeToMinutes(shift.shift_end),
        hasCallout: !!shift.callout_id, // Prioritize shifts with callouts
      };
      
      shiftMap.set(key, shiftData);
      
      // Also index by date for flexible matching
      if (!shiftsByDate.has(shift.shift_date)) {
        shiftsByDate.set(shift.shift_date, []);
      }
      shiftsByDate.get(shift.shift_date).push(shiftData);
      
      console.log(`📅 Mapped shift: ${key} -> ${shiftData.guardName}${shiftData.hasCallout ? ' (from callout)' : ''}`);
    });
    
    // Add callout shifts (these are prioritized)
    calloutShifts.forEach(callout => {
      const normalizedStart = normalizeTime(callout.shift_start);
      const normalizedEnd = normalizeTime(callout.shift_end);
      const key = `${callout.shift_date}_${normalizedStart}_${normalizedEnd}`;
      
      const shiftData = {
        guardName: callout.guard_name || callout.guard_email || "Unknown Guard",
        guardId: callout.assigned_guard_id,
        startMinutes: timeToMinutes(callout.shift_start),
        endMinutes: timeToMinutes(callout.shift_end),
        hasCallout: true, // These definitely have callouts
      };
      
      // Overwrite if exists (prioritize callout shifts)
      shiftMap.set(key, shiftData);
      
      // Also index by date
      if (!shiftsByDate.has(callout.shift_date)) {
        shiftsByDate.set(callout.shift_date, []);
      }
      // Check if already added to avoid duplicates
      const existing = shiftsByDate.get(callout.shift_date).find(s => s.guardId === callout.assigned_guard_id);
      if (!existing) {
        shiftsByDate.get(callout.shift_date).push(shiftData);
      }
      
      console.log(`📞 Mapped callout shift: ${key} -> ${shiftData.guardName} (from callout)`);
    });

    // Helper function to get assigned guard or fallback to scheduled guard
    // Matches by date and checks if time ranges overlap (within 2 hours)
    // Prioritizes shifts with callouts
    const getAssignedGuard = (date, start, end, scheduledGuard) => {
      const normalizedStart = normalizeTime(start);
      const normalizedEnd = normalizeTime(end);
      const exactKey = `${date}_${normalizedStart}_${normalizedEnd}`;
      
      // Try exact match first
      let actualShift = shiftMap.get(exactKey);
      
      // If no exact match, try flexible matching by date and time range
      if (!actualShift) {
        const targetStartMinutes = timeToMinutes(start);
        const dateShifts = shiftsByDate.get(date) || [];
        
        // First, prioritize shifts with callouts (these are definitely from callout acceptance)
        const calloutShifts = dateShifts.filter(s => s.hasCallout);
        if (calloutShifts.length > 0) {
          // If there are callout shifts, use the one with closest time match
          // Use strict matching: within 2 hours (120 minutes) for callouts
          let bestCalloutMatch = null;
          let minCalloutDiff = Infinity;
          
          for (const shift of calloutShifts) {
            const timeDiff = Math.abs(shift.startMinutes - targetStartMinutes);
            // Strict matching: only match if within 2 hours (120 minutes)
            if (timeDiff <= 120 && timeDiff < minCalloutDiff) {
              bestCalloutMatch = shift;
              minCalloutDiff = timeDiff;
            }
          }
          
          if (bestCalloutMatch) {
            actualShift = bestCalloutMatch;
            console.log(`✅ Found callout match for ${date} ${normalizedStart}-${normalizedEnd}: ${bestCalloutMatch.guardName} (diff: ${minCalloutDiff} min, from callout)`);
          }
        }
        
        // If no callout match, try regular shifts
        if (!actualShift) {
          let bestMatch = null;
          let minTimeDiff = Infinity;
          
          for (const shift of dateShifts) {
            const timeDiff = Math.abs(shift.startMinutes - targetStartMinutes);
            // Closest time match (within 3 hours)
            if (timeDiff <= 180 && timeDiff < minTimeDiff) {
              bestMatch = shift;
              minTimeDiff = timeDiff;
            }
          }
          
          if (bestMatch) {
            actualShift = bestMatch;
            console.log(`✅ Found flexible match for ${date} ${normalizedStart}-${normalizedEnd}: ${bestMatch.guardName} (diff: ${minTimeDiff} min)`);
          }
        }
      }
      
      if (actualShift) {
        console.log(`✅ Using assigned guard for ${date} ${normalizedStart}-${normalizedEnd}: ${actualShift.guardName} (was scheduled: ${scheduledGuard})`);
        return actualShift.guardName;
      }
      
      // No final check needed - we already checked callouts above
      // This prevents applying the same shift to multiple time slots
      
      console.log(`⚠️ No match found for ${date} ${normalizedStart}-${normalizedEnd}, using scheduled: ${scheduledGuard}`);
      console.log(`   Available dates in shiftMap: ${Array.from(shiftsByDate.keys()).join(', ') || 'none'}`);
      return scheduledGuard;
    };

    // Get schedule template from database or use default
    let scheduleTemplate = scheduleConfig.scheduleTemplate || [];
    
    // If template is empty, use default template structure
    if (!Array.isArray(scheduleTemplate) || scheduleTemplate.length === 0) {
      scheduleTemplate = [
        { day: "Monday", shifts: [
          { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
          { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
          { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
        ]},
        { day: "Tuesday", shifts: [
          { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
          { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
          { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
        ]},
        { day: "Wednesday", shifts: [
          { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
          { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
          { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
        ]},
        { day: "Thursday", shifts: [
          { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
          { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
          { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
        ]},
        { day: "Friday", shifts: [
          { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
          { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
          { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
        ]},
        { day: "Saturday", shifts: [
          { id: "SHIFT-WE-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Kenny Smith", hours: 8 },
          { id: "SHIFT-WE-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Keisha Wright", hours: 8 },
          { id: "SHIFT-WE-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Ralph", hours: 8 },
        ]},
        { day: "Sunday", shifts: [
          { id: "SHIFT-WE-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Kenny Smith", hours: 8 },
          { id: "SHIFT-WE-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Keisha Wright", hours: 8 },
          { id: "SHIFT-WE-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Ralph", hours: 8 },
        ]},
      ];
    }

    // Build schedule from template, mapping to current week's dates
    const schedule = scheduleTemplate.map((templateDay, idx) => {
      if (idx >= weekDates.length) return null;
      
      return {
        day: templateDay.day || dayNames[idx],
        date: weekDates[idx],
        shifts: (templateDay.shifts || []).map(shiftTemplate => {
          const scheduledGuard = shiftTemplate.scheduledGuard || "Unassigned";
          const actualGuard = getAssignedGuard(
            weekDates[idx],
            shiftTemplate.start,
            shiftTemplate.end,
            scheduledGuard
          );
          
          return {
            id: shiftTemplate.id,
            time: shiftTemplate.time,
            start: shiftTemplate.start,
            end: shiftTemplate.end,
            guard: actualGuard,
            scheduledGuard: scheduledGuard,
            hours: shiftTemplate.hours || 8,
          };
        }),
      };
    }).filter(Boolean);

    // Calculate weekly hours per guard based on actual assignments
    const guardHours = {};
    const guardCounts = {};
    
    // Count hours for each guard from the schedule
    schedule.forEach(day => {
      day.shifts.forEach(shift => {
        const guardName = shift.guard;
        if (!guardCounts[guardName]) {
          guardCounts[guardName] = 0;
        }
        guardCounts[guardName] += shift.hours;
      });
    });
    
    // Also include scheduled guards (in case they have no actual shifts yet)
    const scheduledGuards = {
      "Bob Smith": 5 * 8,
      "Ghazi Abdullah": 5 * 8,
      "Mark Smith": 5 * 8,
      "Ralph": 2 * 8,
      "Kenny Smith": 2 * 8,
      "Keisha Wright": 2 * 8,
    };
    
    // Merge actual and scheduled hours
    Object.keys(scheduledGuards).forEach(guard => {
      guardHours[guard] = guardCounts[guard] || scheduledGuards[guard];
    });
    
    // Add any guards that accepted shifts but aren't in the scheduled list
    Object.keys(guardCounts).forEach(guard => {
      if (!guardHours[guard]) {
        guardHours[guard] = guardCounts[guard];
      }
    });

    // Check if schedule template has been modified (for auto-update logic)
    const templateLastUpdated = scheduleConfig.updatedAt || scheduleConfig.createdAt;
    const isTemplateUnchanged = new Date(templateLastUpdated).getTime() === new Date(scheduleConfig.createdAt).getTime();
    
    const response = {
      building,
      schedule,
      guardHours,
      summary: {
        totalGuards: 6,
        totalShiftsPerDay: 3,
        hoursPerShift: 8,
        weeklyHoursPerGuard: 40, // All guards work 40 hours/week
      },
      weekRange: {
        start: weekDates[0],
        end: weekDates[6],
      },
      // Metadata for emailing
      templateInfo: {
        lastUpdated: templateLastUpdated,
        isUnchanged: isTemplateUnchanged,
        autoUpdateDates: isTemplateUnchanged, // Auto-update dates if template unchanged
        readyForEmail: true, // Schedule is always ready for emailing
      },
    };
    
    console.log(`📅 Schedule response: ${schedule.length} days, week ${weekDates[0]} to ${weekDates[6]}`);
    console.log(`📊 Total shifts mapped: ${shiftMap.size}`);
    console.log(`📞 Callout shifts: ${calloutShifts.length}`);
    
    return res.json(response);
  } catch (e) {
    console.error("getSchedule error:", e);
    return res.status(500).json({
      message: "Failed to load schedule",
      error: e.message,
    });
  }
};

/**
 * Update Schedule Configuration
 * Allows editing building info and guard assignments
 */
exports.updateSchedule = async (req, res) => {
  try {
    const { ScheduleConfig } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || null;
    const { buildingName, buildingLocation, scheduleTemplate } = req.body;

    // Find or create schedule config
    let scheduleConfig = await ScheduleConfig.findOne({
      where: {
        buildingId: "BLD-001",
        ...(tenantId ? { tenantId } : { tenantId: null }),
      },
    });

    const updateData = {};
    if (buildingName !== undefined) updateData.buildingName = buildingName;
    if (buildingLocation !== undefined) updateData.buildingLocation = buildingLocation;
    if (scheduleTemplate !== undefined) {
      // Validate schedule template structure
      if (Array.isArray(scheduleTemplate)) {
        updateData.scheduleTemplate = scheduleTemplate;
      } else {
        return res.status(400).json({
          message: "scheduleTemplate must be an array",
        });
      }
    }

    if (scheduleConfig) {
      await scheduleConfig.update(updateData);
    } else {
      scheduleConfig = await ScheduleConfig.create({
        buildingId: "BLD-001",
        buildingName: buildingName || "Main Office Building",
        buildingLocation: buildingLocation || "123 Main Street, City, State 12345",
        tenantId: tenantId || null,
        scheduleTemplate: scheduleTemplate || [],
      });
    }

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, "role:all", "schedule_updated", {
        building: {
          id: scheduleConfig.buildingId,
          name: scheduleConfig.buildingName,
          location: scheduleConfig.buildingLocation,
        },
        scheduleTemplate: scheduleConfig.scheduleTemplate,
      }).catch(() => {});
    }

    return res.json({
      message: "Schedule updated successfully",
      config: scheduleConfig,
    });
  } catch (e) {
    console.error("updateSchedule error:", e);
    return res.status(500).json({
      message: "Failed to update schedule",
      error: e.message,
    });
  }
};
