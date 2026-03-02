require("dotenv").config();
const { sequelize } = require("../config/db");
const { Shift, Guard } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    const shift = await Shift.findOne({
      include: [{ model: Guard }],
      order: [['created_at', 'DESC']],
      limit: 1
    });

    if (shift) {
      console.log('Shift ID:', shift.id);
      console.log('Guard ID:', shift.guard_id);
      console.log('Guard Email:', shift.Guard?.email || 'N/A');
      console.log('Geofence:', shift.location_lat ? `Lat: ${shift.location_lat}, Lng: ${shift.location_lng}, Radius: ${shift.geofence_radius_m || 100}m` : 'Not set');
      process.exit(0);
    } else {
      console.log('No shifts found in database');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
