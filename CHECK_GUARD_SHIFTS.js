#!/usr/bin/env node
// Check which shifts are assigned to a guard and test running-late endpoint

require('dotenv').config({ path: '../abe-guard-ai/backend/.env' });
const { pool } = require('../abe-guard-ai/backend/src/config/db');
const jwt = require('jsonwebtoken');

const GUARD_EMAIL = 'bob@abe.com';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJndWFyZElkIjoiMGU4OTdjZjUtOWQzYi00Y2Y3LThiMTEtZjg2MjNjMjQ4YWFlIiwidGVuYW50X2lkIjoiNDk0MWEyN2UtZWE2MS00ODQ3LWI5ODMtZjU2ZmIxMjBmMmFhIiwicm9sZSI6Imd1YXJkIiwiaWF0IjoxNzY4MzI2NTQyLCJleHAiOjE3NjgzNjk3NDJ9.WT6X06Pvflj-QbZXKbiFv4umfou5mDDH7GyYJ6NiaOc';

async function checkShifts() {
  try {
    // Decode token to get guardId
    const decoded = jwt.decode(TOKEN);
    const guardId = decoded.guardId;
    
    console.log('🔍 Guard Info:');
    console.log('  Email:', GUARD_EMAIL);
    console.log('  Guard ID:', guardId);
    console.log('');

    // Get shifts assigned to this guard
    const result = await pool.query(
      `SELECT id, guard_id, status, shift_date, shift_start, shift_end 
       FROM shifts 
       WHERE guard_id = $1 
       ORDER BY shift_date DESC, shift_start DESC`,
      [guardId]
    );

    console.log(`✅ Shifts assigned to guard: ${result.rows.length}`);
    console.log('');

    if (result.rows.length === 0) {
      console.log('❌ No shifts assigned! Finding available shifts...');
      const available = await pool.query(
        `SELECT id, shift_date, shift_start, status 
         FROM shifts 
         WHERE (guard_id IS NULL OR guard_id != $1) 
         AND status IN ('OPEN', 'SCHEDULED')
         ORDER BY shift_date DESC, shift_start DESC 
         LIMIT 3`,
        [guardId]
      );

      if (available.rows.length > 0) {
        console.log(`\n📋 Found ${available.rows.length} available shifts. Assigning first one...`);
        const shiftToAssign = available.rows[0];
        await pool.query(
          'UPDATE shifts SET guard_id = $1, status = $2 WHERE id = $3',
          [guardId, 'CLOSED', shiftToAssign.id]
        );
        console.log(`✅ Assigned shift: ${shiftToAssign.id}`);
        console.log(`   Date: ${shiftToAssign.shift_date} ${shiftToAssign.shift_start}`);
      } else {
        console.log('❌ No available shifts to assign');
      }
    } else {
      result.rows.forEach((shift, i) => {
        console.log(`${i + 1}. Shift ID: ${shift.id}`);
        console.log(`   Date: ${shift.shift_date} ${shift.shift_start}`);
        console.log(`   Status: ${shift.status}`);
        console.log(`   Guard ID match: ${String(shift.guard_id) === String(guardId) ? '✅' : '❌'}`);
        console.log('');
      });

      // Test the first shift
      const testShiftId = result.rows[0].id;
      console.log(`🧪 Testing running-late endpoint with shift: ${testShiftId}`);
      console.log('');
      console.log('Run this command:');
      console.log(`curl -X POST http://localhost:4000/shifts/${testShiftId}/running-late \\`);
      console.log(`  -H "Authorization: Bearer ${TOKEN}" \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"reason": "train delay"}'`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkShifts();
