require("dotenv").config();
const { sequelize } = require("../config/db");
const { Shift } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    const shiftId = process.argv[2] || '20da491e-073a-4aab-a750-73a58e2fdc9d';
    
    // NYC coordinates (Central Park area) with 100m radius
    const lat = 40.7829; // Central Park
    const lng = -73.9654;
    const radiusM = 100;

    const shift = await Shift.findByPk(shiftId);
    if (!shift) {
      console.error('❌ Shift not found:', shiftId);
      process.exit(1);
    }

    shift.location_lat = lat;
    shift.location_lng = lng;
    shift.geofence_radius_m = radiusM;
    await shift.save();

    console.log('✅ Geofence configured for shift:', shiftId);
    console.log(`   Location: ${lat}, ${lng}`);
    console.log(`   Radius: ${radiusM}m`);
    console.log('\n📍 Test coordinates:');
    console.log(`   Inside geofence (same location): ${lat}, ${lng}`);
    console.log(`   Outside geofence (~500m away): ${lat + 0.005}, ${lng}`); // ~500m north
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
