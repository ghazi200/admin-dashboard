/**
 * Schedule Controller for Guard UI
 * Returns building schedule with guard assignments
 * Dynamically updates with actual shift assignments when callouts are accepted
 */

const { pool } = require("../config/db");

exports.getSchedule = async (req, res) => {
  try {
    // Building information
    const building = {
      id: "BLD-001",
      name: "Main Office Building",
      location: "123 Main Street, City, State 12345",
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
    let actualShifts = [];
    let calloutShifts = [];
    
    console.log(`\n🚀 ===== SCHEDULE QUERY START =====`);
    console.log(`🚀 Starting schedule query for week: ${weekDates[0]} to ${weekDates[6]}`);
    console.log(`🚀 Pool available: ${!!pool}, pool.query type: ${typeof pool?.query}`);
    
    try {
      console.log(`🔍 Querying shifts for week: ${weekDates[0]} to ${weekDates[6]}`);
      console.log(`   Query params: [${weekDates[0]}, ${weekDates[6]}]`);
      
      if (!pool || typeof pool.query !== 'function') {
        throw new Error('Pool is not available or pool.query is not a function');
      }
      
      console.log(`   Executing query...`);
      const shiftResult = await pool.query(
        `
        SELECT 
          s.id,
          s.shift_date::text as shift_date,
          s.shift_start,
          s.shift_end,
          s.guard_id,
          s.status,
          g.name as guard_name,
          g.email as guard_email,
          c.id as callout_id,
          c.guard_id as called_out_guard_id
        FROM shifts s
        LEFT JOIN guards g ON s.guard_id = g.id
        LEFT JOIN callouts c ON c.shift_id = s.id
        WHERE s.shift_date >= $1::date
          AND s.shift_date <= $2::date
          AND s.status = 'CLOSED'
          AND s.guard_id IS NOT NULL
        ORDER BY s.shift_date, s.shift_start
        `,
        [weekDates[0], weekDates[6]]
      );
      
      console.log(`   ✅ Query executed successfully!`);
      console.log(`   Query executed, result.rows.length: ${shiftResult.rows?.length || 0}`);
      actualShifts = shiftResult.rows || [];
      console.log(`📊 Found ${actualShifts.length} CLOSED shifts for week ${weekDates[0]} to ${weekDates[6]}`);
      
      if (actualShifts.length === 0) {
        console.log(`   ⚠️ WARNING: Query returned 0 rows but test query found shifts!`);
      }
      if (actualShifts.length > 0) {
        actualShifts.forEach(s => {
          console.log(`   - ${s.shift_date} ${s.shift_start}-${s.shift_end}: ${s.guard_name || s.guard_email || 'Unknown'} (callout: ${s.callout_id ? 'YES' : 'NO'})`);
        });
      } else {
        console.log(`   ⚠️ No shifts found! Checking if any shifts exist...`);
        const checkResult = await pool.query(`SELECT COUNT(*) as total FROM shifts WHERE status = 'CLOSED' AND guard_id IS NOT NULL`);
        console.log(`   Total CLOSED shifts in DB: ${checkResult.rows[0]?.total || 0}`);
        const dateCheck = await pool.query(`SELECT shift_date, COUNT(*) as count FROM shifts WHERE status = 'CLOSED' AND guard_id IS NOT NULL GROUP BY shift_date ORDER BY shift_date DESC LIMIT 5`);
        console.log(`   Recent CLOSED shift dates:`);
        dateCheck.rows.forEach(r => {
          console.log(`     ${r.shift_date}: ${r.count} shifts`);
        });
      }
      
      // Also query callouts with their shifts to catch any shifts that had callouts
      // Expand the date range slightly to catch shifts just outside the current week
      const weekStart = new Date(weekDates[0]);
      weekStart.setDate(weekStart.getDate() - 1); // Include day before
      const weekEnd = new Date(weekDates[6]);
      weekEnd.setDate(weekEnd.getDate() + 1); // Include day after
      
      console.log(`🔍 Querying callouts for expanded week: ${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`);
      const calloutResult = await pool.query(
        `
        SELECT 
          c.id as callout_id,
          c.guard_id as called_out_guard_id,
          s.id as shift_id,
          s.shift_date::text as shift_date,
          s.shift_start,
          s.shift_end,
          s.guard_id as assigned_guard_id,
          s.status
        FROM callouts c
        LEFT JOIN shifts s ON c.shift_id = s.id
        WHERE s.shift_date >= $1::date
          AND s.shift_date <= $2::date
          AND s.status = 'CLOSED'
          AND s.guard_id IS NOT NULL
        ORDER BY s.shift_date, s.shift_start
        `,
        [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
      );
      const calloutRows = calloutResult.rows || [];
      console.log(`📞 Found ${calloutRows.length} callout rows from query`);
      
      // Get guard names for callout shifts
      for (const callout of calloutRows) {
        try {
          const guardResult = await pool.query(
            `SELECT name, email FROM guards WHERE id = $1 LIMIT 1`,
            [callout.assigned_guard_id]
          );
          if (guardResult.rows && guardResult.rows.length > 0) {
            callout.guard_name = guardResult.rows[0].name;
            callout.guard_email = guardResult.rows[0].email;
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
      console.error("\n❌ ===== SCHEDULE QUERY ERROR =====");
      console.error("❌ ERROR querying shifts/callouts for schedule:", err);
      console.error("❌ Error message:", err.message);
      console.error("❌ Error stack:", err.stack);
      console.error("❌ ===== END ERROR =====\n");
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

    // Helper to normalize date (handle both Date objects and strings)
    const normalizeDate = (date) => {
      if (!date) return null;
      if (date instanceof Date) {
        return date.toISOString().split('T')[0]; // Convert Date to YYYY-MM-DD
      }
      return String(date).substring(0, 10); // Take first 10 chars of string
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
      const shiftDate = normalizeDate(shift.shift_date);
      const normalizedStart = normalizeTime(shift.shift_start);
      const normalizedEnd = normalizeTime(shift.shift_end);
      const key = `${shiftDate}_${normalizedStart}_${normalizedEnd}`;
      
      const shiftData = {
        guardName: shift.guard_name || shift.guard_email || "Unknown Guard",
        guardId: shift.guard_id,
        startMinutes: timeToMinutes(shift.shift_start),
        endMinutes: timeToMinutes(shift.shift_end),
        hasCallout: !!shift.callout_id, // Prioritize shifts with callouts
      };
      
      shiftMap.set(key, shiftData);
      
      // Also index by date for flexible matching
      if (!shiftsByDate.has(shiftDate)) {
        shiftsByDate.set(shiftDate, []);
      }
      shiftsByDate.get(shiftDate).push(shiftData);
      
      console.log(`📅 Mapped shift: ${key} -> ${shiftData.guardName}${shiftData.hasCallout ? ' (from callout)' : ''}`);
    });
    
    // Add callout shifts (these are prioritized)
    calloutShifts.forEach(callout => {
      const calloutDate = normalizeDate(callout.shift_date);
      const normalizedStart = normalizeTime(callout.shift_start);
      const normalizedEnd = normalizeTime(callout.shift_end);
      const key = `${calloutDate}_${normalizedStart}_${normalizedEnd}`;
      
      const shiftData = {
        guardName: callout.guard_name || callout.guard_email || "Unknown Guard",
        guardId: callout.assigned_guard_id,
        startMinutes: timeToMinutes(callout.shift_start),
        endMinutes: timeToMinutes(callout.shift_end),
        hasCallout: true, // These definitely have callouts
      };
      
      // Overwrite if exists (prioritize callout shifts)
      shiftMap.set(key, shiftData);
      
      // Also index by date - replace existing entry if it exists
      if (!shiftsByDate.has(calloutDate)) {
        shiftsByDate.set(calloutDate, []);
      }
      // Remove existing entry with same time if it exists, then add the callout shift
      const dateShifts = shiftsByDate.get(calloutDate);
      const existingIndex = dateShifts.findIndex(s => s.startMinutes === shiftData.startMinutes);
      if (existingIndex >= 0) {
        // Replace existing entry
        dateShifts[existingIndex] = shiftData;
        console.log(`   Replaced existing shift at index ${existingIndex} with callout shift`);
      } else {
        // Add new entry
        dateShifts.push(shiftData);
      }
      
      console.log(`📞 Mapped callout shift: ${key} -> ${shiftData.guardName} (from callout)`);
    });

    // Debug: Show final map state
    console.log(`\n📊 Final shiftMap state:`);
    console.log(`   Total keys: ${shiftMap.size}`);
    Array.from(shiftMap.entries()).forEach(([key, value]) => {
      console.log(`   ${key} -> ${value.guardName} (hasCallout: ${value.hasCallout})`);
    });
    console.log(`\n📊 Final shiftsByDate state:`);
    Array.from(shiftsByDate.entries()).forEach(([date, shifts]) => {
      console.log(`   ${date}: ${shifts.length} shifts`);
      shifts.forEach(s => {
        console.log(`     - ${s.guardName} at ${s.startMinutes} min (hasCallout: ${s.hasCallout})`);
      });
    });
    console.log('');

    // Helper function to get assigned guard or fallback to scheduled guard
    // Matches by date and checks if time ranges overlap
    // Prioritizes shifts with callouts
    const getAssignedGuard = (date, start, end, scheduledGuard) => {
      const normalizedStart = normalizeTime(start);
      const normalizedEnd = normalizeTime(end);
      const exactKey = `${date}_${normalizedStart}_${normalizedEnd}`;
      
      console.log(`🔍 Looking for: ${exactKey} (date: ${date}, start: ${start}, end: ${end})`);
      const allKeys = Array.from(shiftMap.keys());
      console.log(`   ShiftMap has ${allKeys.length} keys: ${allKeys.slice(0, 3).join(', ')}${allKeys.length > 3 ? '...' : ''}`);
      
      // Try exact match first
      let actualShift = shiftMap.get(exactKey);
      
      if (actualShift) {
        console.log(`✅ Exact match found: ${actualShift.guardName} (hasCallout: ${actualShift.hasCallout})`);
      } else {
        console.log(`❌ No exact match for key: ${exactKey}`);
      }
      
      // If no exact match, try flexible matching by date and time range
      if (!actualShift) {
        const targetStartMinutes = timeToMinutes(start);
        console.log(`   No exact match, trying flexible. Target time: ${start} (${targetStartMinutes} min)`);
        const dateShifts = shiftsByDate.get(date) || [];
        console.log(`   Shifts for date ${date}: ${dateShifts.length}`);
        dateShifts.forEach(s => {
          console.log(`     - ${s.guardName} at ${s.startMinutes} min (hasCallout: ${s.hasCallout})`);
        });
        
        // First, prioritize shifts with callouts (these are definitely from callout acceptance)
        const calloutShifts = dateShifts.filter(s => s.hasCallout);
        console.log(`   Callout shifts: ${calloutShifts.length}`);
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
      
      console.log(`⚠️ No match found for ${date} ${normalizedStart}-${normalizedEnd}, using scheduled: ${scheduledGuard}`);
      const availableDates = Array.from(shiftsByDate.keys());
      console.log(`   Available dates in shiftMap: ${availableDates.length > 0 ? availableDates.join(', ') : 'none'}`);
      if (availableDates.length > 0) {
        const dateShifts = shiftsByDate.get(date) || [];
        console.log(`   Shifts for ${date}: ${dateShifts.length}`);
        dateShifts.forEach(s => {
          console.log(`     - ${s.guardName} (${s.startMinutes} min, hasCallout: ${s.hasCallout})`);
        });
      }
      return scheduledGuard;
    };

    // Schedule data - dynamically updated with actual assignments
    const schedule = [
      // Monday-Friday shifts
      {
        day: dayNames[0],
        date: weekDates[0],
        shifts: [
          {
            id: "SHIFT-MF-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[0], "07:00", "15:00", "Bob Smith"),
            scheduledGuard: "Bob Smith",
            hours: 8,
          },
          {
            id: "SHIFT-MF-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[0], "15:00", "23:00", "Ghazi Abdullah"),
            scheduledGuard: "Ghazi Abdullah",
            hours: 8,
          },
          {
            id: "SHIFT-MF-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[0], "23:00", "07:00", "Mark Smith"),
            scheduledGuard: "Mark Smith",
            hours: 8,
          },
        ],
      },
      {
        day: dayNames[1],
        date: weekDates[1],
        shifts: [
          {
            id: "SHIFT-MF-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[1], "07:00", "15:00", "Bob Smith"),
            scheduledGuard: "Bob Smith",
            hours: 8,
          },
          {
            id: "SHIFT-MF-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[1], "15:00", "23:00", "Ghazi Abdullah"),
            scheduledGuard: "Ghazi Abdullah",
            hours: 8,
          },
          {
            id: "SHIFT-MF-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[1], "23:00", "07:00", "Mark Smith"),
            scheduledGuard: "Mark Smith",
            hours: 8,
          },
        ],
      },
      {
        day: dayNames[2],
        date: weekDates[2],
        shifts: [
          {
            id: "SHIFT-MF-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[2], "07:00", "15:00", "Bob Smith"),
            scheduledGuard: "Bob Smith",
            hours: 8,
          },
          {
            id: "SHIFT-MF-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[2], "15:00", "23:00", "Ghazi Abdullah"),
            scheduledGuard: "Ghazi Abdullah",
            hours: 8,
          },
          {
            id: "SHIFT-MF-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[2], "23:00", "07:00", "Mark Smith"),
            scheduledGuard: "Mark Smith",
            hours: 8,
          },
        ],
      },
      {
        day: dayNames[3],
        date: weekDates[3],
        shifts: [
          {
            id: "SHIFT-MF-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[3], "07:00", "15:00", "Bob Smith"),
            scheduledGuard: "Bob Smith",
            hours: 8,
          },
          {
            id: "SHIFT-MF-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[3], "15:00", "23:00", "Ghazi Abdullah"),
            scheduledGuard: "Ghazi Abdullah",
            hours: 8,
          },
          {
            id: "SHIFT-MF-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[3], "23:00", "07:00", "Mark Smith"),
            scheduledGuard: "Mark Smith",
            hours: 8,
          },
        ],
      },
      {
        day: dayNames[4],
        date: weekDates[4],
        shifts: [
          {
            id: "SHIFT-MF-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[4], "07:00", "15:00", "Bob Smith"),
            scheduledGuard: "Bob Smith",
            hours: 8,
          },
          {
            id: "SHIFT-MF-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[4], "15:00", "23:00", "Ghazi Abdullah"),
            scheduledGuard: "Ghazi Abdullah",
            hours: 8,
          },
          {
            id: "SHIFT-MF-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[4], "23:00", "07:00", "Mark Smith"),
            scheduledGuard: "Mark Smith",
            hours: 8,
          },
        ],
      },
      // Saturday-Sunday shifts
      {
        day: dayNames[5],
        date: weekDates[5],
        shifts: [
          {
            id: "SHIFT-WE-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[5], "07:00", "15:00", "Kenny Smith"),
            scheduledGuard: "Kenny Smith",
            hours: 8,
          },
          {
            id: "SHIFT-WE-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[5], "15:00", "23:00", "Keisha Wright"),
            scheduledGuard: "Keisha Wright",
            hours: 8,
          },
          {
            id: "SHIFT-WE-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[5], "23:00", "07:00", "Ralph"),
            scheduledGuard: "Ralph",
            hours: 8,
          },
        ],
      },
      {
        day: dayNames[6],
        date: weekDates[6],
        shifts: [
          {
            id: "SHIFT-WE-1",
            time: "7:00 AM - 3:00 PM",
            start: "07:00",
            end: "15:00",
            guard: getAssignedGuard(weekDates[6], "07:00", "15:00", "Kenny Smith"),
            scheduledGuard: "Kenny Smith",
            hours: 8,
          },
          {
            id: "SHIFT-WE-2",
            time: "3:00 PM - 11:00 PM",
            start: "15:00",
            end: "23:00",
            guard: getAssignedGuard(weekDates[6], "15:00", "23:00", "Keisha Wright"),
            scheduledGuard: "Keisha Wright",
            hours: 8,
          },
          {
            id: "SHIFT-WE-3",
            time: "11:00 PM - 7:00 AM",
            start: "23:00",
            end: "07:00",
            guard: getAssignedGuard(weekDates[6], "23:00", "07:00", "Ralph"),
            scheduledGuard: "Ralph",
            hours: 8,
          },
        ],
      },
    ];

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
