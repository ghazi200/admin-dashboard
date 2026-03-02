require('dotenv').config();
const express = require('express');
const app = express();
const { pool } = require('../config/db');

app.locals = {
  models: { sequelize: null } // We'll use pool directly
};

// Import the controller
const scheduleController = require('../controllers/schedule.controller');

async function testSchedule() {
  try {
    // Create a mock request
    const req = {
      app: app,
    };
    
    // Create a mock response
    let responseData = null;
    const res = {
      json: (data) => {
        responseData = data;
        console.log('\n✅ Schedule Response:');
        console.log('Building:', data.building);
        console.log('Week Range:', data.weekRange || 'not provided');
        console.log('\n📅 Schedule Days:');
        data.schedule.forEach((day, idx) => {
          console.log(`\n${day.day} (${day.date || 'no date'}):`);
          day.shifts.forEach(shift => {
            const changed = shift.guard !== shift.scheduledGuard;
            console.log(`  ${shift.time}: ${shift.guard}${changed ? ' (was: ' + shift.scheduledGuard + ')' : ''}`);
          });
        });
        console.log('\n👥 Guard Hours:', data.guardHours);
      },
      status: (code) => ({
        json: (data) => {
          console.error('❌ Error:', code, data);
        }
      })
    };
    
    await scheduleController.getSchedule(req, res);
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test error:', err);
    console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

testSchedule();
