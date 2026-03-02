require('dotenv').config();
const express = require('express');
const app = express();

// Mock the app.locals.models structure
const { sequelize } = require('../models');

app.locals = {
  models: { sequelize }
};

// Import the controller
const scheduleController = require('../controllers/adminSchedule.controller');

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
        console.log('Week Range:', data.weekRange);
        console.log('\n📅 Schedule Days:');
        data.schedule.forEach((day, idx) => {
          console.log(`\n${day.day} (${day.date || 'no date'}):`);
          day.shifts.forEach(shift => {
            console.log(`  ${shift.time}: ${shift.guard} ${shift.guard !== shift.scheduledGuard ? '(was: ' + shift.scheduledGuard + ')' : ''}`);
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
    
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test error:', err);
    await sequelize.close();
    process.exit(1);
  }
}

testSchedule();
