require('dotenv').config();
const { pool } = require('../config/db');
const scheduleController = require('../controllers/schedule.controller');

const express = require('express');
const app = express();
app.locals = { models: { sequelize: null } };

async function test() {
  try {
    const req = { app };
    let responseData = null;
    const res = {
      json: (data) => {
        responseData = data;
        console.log('\n=== SCHEDULE RESPONSE ===');
        console.log('Monday shifts:');
        const monday = data.schedule.find(d => d.day === 'Monday');
        if (monday) {
          monday.shifts.forEach(s => {
            console.log(`  ${s.time}: ${s.guard}${s.guard !== s.scheduledGuard ? ' (was: ' + s.scheduledGuard + ')' : ''}`);
          });
        } else {
          console.log('  Monday not found in schedule');
        }
      },
      status: (code) => ({
        json: (data) => {
          console.error('ERROR:', code, data);
        }
      })
    };
    
    await scheduleController.getSchedule(req, res);
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

test();
