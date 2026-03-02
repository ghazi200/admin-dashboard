require('dotenv').config();
const { pool } = require('../config/db');

async function testSchedule() {
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

    console.log('Current week:', weekDates[0], 'to', weekDates[6]);
    console.log('Monday date:', weekDates[0]);
    console.log('');

    // Query shifts
    const shiftResult = await pool.query(
      `
      SELECT 
        s.id,
        s.shift_date,
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
      WHERE s.shift_date >= $1 
        AND s.shift_date <= $2
        AND s.status = 'CLOSED'
        AND s.guard_id IS NOT NULL
      ORDER BY s.shift_date, s.shift_start
      `,
      [weekDates[0], weekDates[6]]
    );

    console.log(`Found ${shiftResult.rows.length} CLOSED shifts`);
    shiftResult.rows.forEach(s => {
      console.log(`  ${s.shift_date} ${s.shift_start}-${s.shift_end}: ${s.guard_name || s.guard_email} (has callout: ${s.callout_id ? 'YES' : 'NO'})`);
    });

    // Query callouts
    const weekStart = new Date(weekDates[0]);
    weekStart.setDate(weekStart.getDate() - 1);
    const weekEnd = new Date(weekDates[6]);
    weekEnd.setDate(weekEnd.getDate() + 1);

    const calloutResult = await pool.query(
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
      [weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]]
    );

    console.log(`\nFound ${calloutResult.rows.length} callouts with CLOSED shifts`);
    calloutResult.rows.forEach(c => {
      console.log(`  ${c.shift_date} ${c.shift_start}-${c.shift_end}: assigned guard ${c.assigned_guard_id ? String(c.assigned_guard_id).substring(0, 8) + '...' : 'NULL'}`);
    });

    // Test the matching logic
    console.log('\n📅 Testing Monday 7am-3pm slot:');
    const mondayShifts = shiftResult.rows.filter(s => s.shift_date === weekDates[0]);
    const mondayCallouts = calloutResult.rows.filter(c => c.shift_date === weekDates[0]);
    
    console.log(`  Regular shifts on Monday: ${mondayShifts.length}`);
    console.log(`  Callout shifts on Monday: ${mondayCallouts.length}`);
    
    // Check for 07:00-15:00 match
    const targetStart = '07:00';
    const normalizeTime = (time) => String(time).substring(0, 5);
    const timeToMinutes = (time) => {
      const normalized = normalizeTime(time);
      const [hours, minutes] = normalized.split(':').map(Number);
      return hours * 60 + (minutes || 0);
    };
    
    const targetMinutes = timeToMinutes(targetStart);
    console.log(`  Target time: ${targetStart} (${targetMinutes} minutes)`);
    
    mondayShifts.forEach(s => {
      const sStart = normalizeTime(s.shift_start);
      const sMinutes = timeToMinutes(s.shift_start);
      const diff = Math.abs(sMinutes - targetMinutes);
      console.log(`    Shift ${sStart} (${sMinutes} min): ${s.guard_name} - diff: ${diff} min ${diff <= 120 ? '✅ MATCH' : '❌'}`);
    });

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
    process.exit(1);
  }
}

testSchedule();
