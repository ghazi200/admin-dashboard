/**
 * Migration: Add geofencing location fields to shifts table
 * 
 * Adds location_lat, location_lng, and geofence_radius_m columns to enable
 * geofenced clock-in validation for shifts.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist
    const tableDescription = await queryInterface.describeTable('shifts');
    
    if (!tableDescription.location_lat) {
      await queryInterface.addColumn('shifts', 'location_lat', {
        type: Sequelize.DOUBLE,
        allowNull: true,
        comment: 'Latitude of shift location for geofencing'
      });
      console.log('✅ Added location_lat column to shifts table');
    } else {
      console.log('⚠️  location_lat column already exists in shifts table');
    }

    if (!tableDescription.location_lng) {
      await queryInterface.addColumn('shifts', 'location_lng', {
        type: Sequelize.DOUBLE,
        allowNull: true,
        comment: 'Longitude of shift location for geofencing'
      });
      console.log('✅ Added location_lng column to shifts table');
    } else {
      console.log('⚠️  location_lng column already exists in shifts table');
    }

    if (!tableDescription.geofence_radius_m) {
      await queryInterface.addColumn('shifts', 'geofence_radius_m', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 100,
        comment: 'Geofence radius in meters (default: 100m)'
      });
      console.log('✅ Added geofence_radius_m column to shifts table');
    } else {
      console.log('⚠️  geofence_radius_m column already exists in shifts table');
    }

    // Create index for geospatial queries
    try {
      await queryInterface.addIndex('shifts', ['location_lat', 'location_lng'], {
        name: 'idx_shifts_location_coords',
        where: {
          location_lat: { [Sequelize.Op.ne]: null },
          location_lng: { [Sequelize.Op.ne]: null }
        }
      });
      console.log('✅ Created index idx_shifts_location_coords');
    } catch (error) {
      // Index might already exist
      if (error.name !== 'SequelizeDatabaseError' || !error.message.includes('already exists')) {
        throw error;
      }
      console.log('⚠️  Index idx_shifts_location_coords already exists');
    }
  },

  async down(queryInterface) {
    // Remove index
    try {
      await queryInterface.removeIndex('shifts', 'idx_shifts_location_coords');
      console.log('✅ Removed index idx_shifts_location_coords');
    } catch (error) {
      console.log('⚠️  Index idx_shifts_location_coords does not exist');
    }

    // Remove columns
    const tableDescription = await queryInterface.describeTable('shifts');
    
    if (tableDescription.geofence_radius_m) {
      await queryInterface.removeColumn('shifts', 'geofence_radius_m');
      console.log('✅ Removed geofence_radius_m column from shifts table');
    }

    if (tableDescription.location_lng) {
      await queryInterface.removeColumn('shifts', 'location_lng');
      console.log('✅ Removed location_lng column from shifts table');
    }

    if (tableDescription.location_lat) {
      await queryInterface.removeColumn('shifts', 'location_lat');
      console.log('✅ Removed location_lat column from shifts table');
    }
  }
};
