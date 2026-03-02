/**
 * Create schedule_config table for storing editable schedule templates
 * This allows admins to edit building info and guard assignments
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  }
);

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Create schedule_config table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schedule_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        building_id VARCHAR(50) DEFAULT 'BLD-001',
        building_name VARCHAR(255) DEFAULT 'Main Office Building',
        building_location TEXT DEFAULT '123 Main Street, City, State 12345',
        schedule_template JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, building_id)
      );
    `);

    console.log("✅ schedule_config table created");

    // Insert default config if none exists
    const [existing] = await sequelize.query(`
      SELECT COUNT(*) as count FROM schedule_config WHERE building_id = 'BLD-001'
    `);

    if (parseInt(existing[0]?.count || 0) === 0) {
      const defaultTemplate = [
        {
          day: "Monday",
          shifts: [
            { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
            { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
            { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
          ],
        },
        {
          day: "Tuesday",
          shifts: [
            { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
            { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
            { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
          ],
        },
        {
          day: "Wednesday",
          shifts: [
            { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
            { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
            { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
          ],
        },
        {
          day: "Thursday",
          shifts: [
            { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
            { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
            { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
          ],
        },
        {
          day: "Friday",
          shifts: [
            { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
            { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
            { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
          ],
        },
        {
          day: "Saturday",
          shifts: [
            { id: "SHIFT-WE-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Kenny Smith", hours: 8 },
            { id: "SHIFT-WE-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Keisha Wright", hours: 8 },
            { id: "SHIFT-WE-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Ralph", hours: 8 },
          ],
        },
        {
          day: "Sunday",
          shifts: [
            { id: "SHIFT-WE-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Kenny Smith", hours: 8 },
            { id: "SHIFT-WE-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Keisha Wright", hours: 8 },
            { id: "SHIFT-WE-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Ralph", hours: 8 },
          ],
        },
      ];

      await sequelize.query(`
        INSERT INTO schedule_config (building_id, building_name, building_location, schedule_template)
        VALUES ('BLD-001', 'Main Office Building', '123 Main Street, City, State 12345', $1::jsonb)
      `, {
        bind: [JSON.stringify(defaultTemplate)],
      });

      console.log("✅ Default schedule config inserted");
    }

    console.log("✅ Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
