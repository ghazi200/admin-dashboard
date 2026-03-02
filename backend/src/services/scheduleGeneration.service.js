/**
 * Automatic Schedule Generation Service
 * 
 * Generates shifts automatically based on constraints:
 * - Date ranges
 * - Time slots
 * - Location requirements
 * - Minimum/maximum guards per shift
 * - Guard availability and skills
 */

const { v4: uuidv4 } = require('uuid');
const shiftOptimizationService = require('./shiftOptimization.service');

/**
 * Generate shifts for a date range with time slots
 * @param {Object} options - Generation options
 * @param {String} options.tenantId - Tenant ID
 * @param {String} options.startDate - Start date (YYYY-MM-DD)
 * @param {String} options.endDate - End date (YYYY-MM-DD)
 * @param {Array} options.timeSlots - Array of {start, end, location, minGuards, maxGuards}
 * @param {Object} options.constraints - {autoAssign: boolean, minScore: number, excludeWeekends: boolean}
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Generation results
 */
async function generateSchedule(options, models) {
  const { sequelize } = models;
  const {
    tenantId,
    startDate,
    endDate,
    timeSlots = [],
    constraints = {}
  } = options;

  const {
    autoAssign = false,
    minScore = 60,
    excludeWeekends = false,
    excludeHolidays = false
  } = constraints;

  if (!tenantId || !startDate || !endDate) {
    throw new Error('tenantId, startDate, and endDate are required');
  }

  if (!timeSlots || timeSlots.length === 0) {
    throw new Error('At least one time slot is required');
  }

  const results = {
    totalShifts: 0,
    createdShifts: [],
    assignedShifts: [],
    failedAssignments: [],
    skippedDates: []
  };

  // Generate date range
  const dates = generateDateRange(startDate, endDate, excludeWeekends, excludeHolidays);

  // Get all guards for the tenant
  const [guards] = await sequelize.query(`
    SELECT id, name, email, is_active
    FROM guards
    WHERE tenant_id = $1 AND is_active = true
  `, {
    bind: [tenantId]
  });

  if (guards.length === 0) {
    throw new Error('No active guards found for tenant');
  }

  // Generate shifts for each date and time slot
  for (const date of dates) {
    for (const timeSlot of timeSlots) {
      const {
        start,
        end,
        location = null,
        minGuards = 1,
        maxGuards = 1
      } = timeSlot;

      // Create shifts (one per guard needed)
      for (let i = 0; i < maxGuards; i++) {
        const shiftId = uuidv4();
        const shift = {
          id: shiftId,
          tenant_id: tenantId,
          shift_date: date,
          shift_start: start,
          shift_end: end,
          location: location,
          status: 'OPEN',
          guard_id: null,
          created_at: new Date()
        };

        try {
          // Create shift
          await sequelize.query(`
            INSERT INTO shifts (id, tenant_id, shift_date, shift_start, shift_end, location, status, guard_id, created_at)
            VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7, $8, $9)
          `, {
            bind: [
              shift.id,
              shift.tenant_id,
              shift.shift_date,
              shift.shift_start,
              shift.shift_end,
              shift.location,
              shift.status,
              shift.guard_id,
              shift.created_at
            ]
          });

          results.totalShifts++;
          results.createdShifts.push({
            shiftId: shift.id,
            date: shift.shift_date,
            time: `${shift.shift_start} - ${shift.shift_end}`,
            location: shift.location
          });

          // Auto-assign if requested
          if (autoAssign && i < minGuards) {
            try {
              const assignmentResult = await shiftOptimizationService.autoAssignGuard(
                shift,
                models,
                { autoAssign: true, minScore }
              );

              if (assignmentResult.success && assignmentResult.assignedGuard) {
                // Check conflicts before finalizing
                const conflicts = await shiftOptimizationService.detectConflicts(
                  shift,
                  assignmentResult.assignedGuard.guardId,
                  models
                );

                if (!conflicts.hasConflicts) {
                  // Update shift with assigned guard
                  await sequelize.query(`
                    UPDATE shifts
                    SET guard_id = $1, status = $2, ai_decision = $3
                    WHERE id = $4
                  `, {
                    bind: [
                      assignmentResult.assignedGuard.guardId,
                      'CLOSED',
                      JSON.stringify(assignmentResult.aiDecision),
                      shift.id
                    ]
                  });

                  results.assignedShifts.push({
                    shiftId: shift.id,
                    guardId: assignmentResult.assignedGuard.guardId,
                    guardName: assignmentResult.assignedGuard.guardName,
                    score: assignmentResult.assignedGuard.totalScore
                  });
                } else {
                  results.failedAssignments.push({
                    shiftId: shift.id,
                    reason: 'Conflicts detected',
                    conflicts: conflicts.details
                  });
                }
              } else {
                results.failedAssignments.push({
                  shiftId: shift.id,
                  reason: assignmentResult.message || 'No suitable guard found',
                  topCandidate: assignmentResult.topCandidate
                });
              }
            } catch (assignError) {
              results.failedAssignments.push({
                shiftId: shift.id,
                reason: assignError.message
              });
            }
          }
        } catch (error) {
          console.error(`Failed to create shift for ${date} ${start}-${end}:`, error);
          results.failedAssignments.push({
            date,
            timeSlot: `${start}-${end}`,
            reason: error.message
          });
        }
      }
    }
  }

  return results;
}

/**
 * Generate date range excluding weekends and holidays
 */
function generateDateRange(startDate, endDate, excludeWeekends, excludeHolidays) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  // Common US holidays (simplified - can be expanded)
  const holidays = [
    '01-01', // New Year's Day
    '07-04', // Independence Day
    '12-25', // Christmas
    '11-24', // Thanksgiving (simplified - actual date varies)
  ];

  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    const monthDay = `${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

    let skip = false;

    if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      skip = true;
    }

    if (excludeHolidays && holidays.includes(monthDay)) {
      skip = true;
    }

    if (!skip) {
      dates.push(dateStr);
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Generate schedule from template
 * @param {Object} template - Schedule template
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Generation results
 */
async function generateFromTemplate(template, models) {
  const {
    tenantId,
    name,
    startDate,
    endDate,
    timeSlots,
    constraints,
    repeatWeekly = false,
    weeksToRepeat = 1
  } = template;

  if (repeatWeekly) {
    // Generate for multiple weeks
    const results = {
      totalShifts: 0,
      createdShifts: [],
      assignedShifts: [],
      failedAssignments: [],
      weeks: []
    };

    for (let week = 0; week < weeksToRepeat; week++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (week * 7));
      const weekEnd = new Date(endDate);
      weekEnd.setDate(weekEnd.getDate() + (week * 7));

      const weekResult = await generateSchedule({
        tenantId,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        timeSlots,
        constraints
      }, models);

      results.weeks.push({
        week: week + 1,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        ...weekResult
      });

      results.totalShifts += weekResult.totalShifts;
      results.createdShifts.push(...weekResult.createdShifts);
      results.assignedShifts.push(...weekResult.assignedShifts);
      results.failedAssignments.push(...weekResult.failedAssignments);
    }

    return results;
  } else {
    return await generateSchedule({
      tenantId,
      startDate,
      endDate,
      timeSlots,
      constraints
    }, models);
  }
}

module.exports = {
  generateSchedule,
  generateFromTemplate,
  generateDateRange
};
