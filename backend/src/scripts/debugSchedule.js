require('dotenv').config();
const { sequelize } = require('../models');

async function debugSchedule() {
  try {
    // Get current week's dates
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date.toISOString().split('T')[0]);
    }

    console.log('📅 Current week dates:', weekDates);
    console.log('📅 Monday date:', weekDates[0]);
    console.log('');

    // Query all shifts for this week
    const [allShifts] = await sequelize.query(
      `SELECT id, shift_date, shift_start, shift_end, guard_id, status 
       FROM shifts 
       WHERE shift_date >= $1 AND shift_date <= $2
       ORDER BY shift_date, shift_start`,
      { bind: [weekDates[0], weekDates[6]] }
    );

    console.log(`📊 All shifts for this week: ${allShifts.length}`);
    allShifts.forEach(s => {
      console.log(`  ${s.shift_date} ${s.shift_start}-${s.shift_end} | Status: ${s.status} | Guard: ${s.guard_id ? String(s.guard_id).substring(0, 8) + '...' : 'NULL'}`);
    });
    console.log('');

    // Query CLOSED shifts with guard assignments
    const [closedShifts] = await sequelize.query(
      `SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.guard_id, s.status,
              c.id as callout_id, c.guard_id as called_out_guard_id
       FROM shifts s
       LEFT JOIN callouts c ON c.shift_id = s.id
       WHERE s.shift_date >= $1 AND s.shift_date <= $2
         AND s.status = 'CLOSED'
         AND s.guard_id IS NOT NULL
       ORDER BY s.shift_date, s.shift_start`,
      { bind: [weekDates[0], weekDates[6]] }
    );

    console.log(`✅ CLOSED shifts with guards: ${closedShifts.length}`);
    for (const s of closedShifts) {
      console.log(`  ${s.shift_date} ${s.shift_start}-${s.shift_end}`);
      console.log(`    Guard ID: ${String(s.guard_id).substring(0, 8)}...`);
      console.log(`    Has callout: ${s.callout_id ? 'YES' : 'NO'}`);
      if (s.callout_id) {
        console.log(`    Called out guard: ${String(s.called_out_guard_id).substring(0, 8)}...`);
      }
      
      // Try to get guard name
      try {
        const [guardRows] = await sequelize.query(
          `SELECT name, email FROM guards WHERE id = $1 LIMIT 1`,
          { bind: [s.guard_id] }
        );
        if (guardRows && guardRows.length > 0) {
          console.log(`    Guard name: ${guardRows[0].name || guardRows[0].email}`);
        } else {
          console.log(`    Guard name: NOT FOUND in guards table`);
        }
      } catch (err) {
        console.log(`    Guard name: Error querying - ${err.message}`);
      }
      console.log('');
    }

    // Check for Monday specifically
    console.log(`🔍 Checking Monday (${weekDates[0]}) shifts:`);
    const mondayShifts = closedShifts.filter(s => s.shift_date === weekDates[0]);
    console.log(`  Found ${mondayShifts.length} CLOSED shifts on Monday`);
    
    // Check what the schedule expects for Monday
    const scheduleTimes = [
      { start: '07:00', end: '15:00', scheduled: 'Bob Smith' },
      { start: '15:00', end: '23:00', scheduled: 'Ghazi Abdullah' },
      { start: '23:00', end: '07:00', scheduled: 'Mark Smith' },
    ];

    scheduleTimes.forEach(slot => {
      console.log(`\n  Schedule slot: ${slot.start}-${slot.end} (scheduled: ${slot.scheduled})`);
      
      // Try exact match
      const exactMatch = mondayShifts.find(s => {
        const sStart = String(s.shift_start).substring(0, 5);
        const sEnd = String(s.shift_end).substring(0, 5);
        return sStart === slot.start && sEnd === slot.end;
      });
      
      if (exactMatch) {
        console.log(`    ✅ Exact match found!`);
        console.log(`    Shift ID: ${exactMatch.id}`);
        console.log(`    Guard ID: ${String(exactMatch.guard_id).substring(0, 8)}...`);
      } else {
        console.log(`    ❌ No exact match`);
        
        // Try flexible match (within 3 hours)
        const normalizeTime = (time) => String(time).substring(0, 5);
        const timeToMinutes = (time) => {
          const normalized = normalizeTime(time);
          const [hours, minutes] = normalized.split(':').map(Number);
          return hours * 60 + (minutes || 0);
        };
        
        const targetStart = timeToMinutes(slot.start);
        let bestMatch = null;
        let minDiff = Infinity;
        
        mondayShifts.forEach(s => {
          const sStart = timeToMinutes(s.shift_start);
          const diff = Math.abs(sStart - targetStart);
          if (diff <= 180 && diff < minDiff) {
            minDiff = diff;
            bestMatch = s;
          }
        });
        
        if (bestMatch) {
          console.log(`    ⚠️  Flexible match found (diff: ${minDiff} min)`);
          console.log(`    Shift: ${bestMatch.shift_start}-${bestMatch.shift_end}`);
          console.log(`    Guard ID: ${String(bestMatch.guard_id).substring(0, 8)}...`);
        } else {
          console.log(`    ❌ No flexible match either`);
        }
      }
    });

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    await sequelize.close();
    process.exit(1);
  }
}

debugSchedule();
