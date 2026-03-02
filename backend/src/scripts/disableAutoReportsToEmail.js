/**
 * One-off script: stop auto reports to techworldstarzllc@gmail.com
 * - Disables the "scheduled reports" email scheduler (no more auto report emails)
 * - Deactivates any scheduled report that sends to this email and removes it from recipients
 *
 * Run from backend: node src/scripts/disableAutoReportsToEmail.js
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

const TARGET_EMAIL = "techworldstarzllc@gmail.com";

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

async function main() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    // 1) Disable the scheduled reports email scheduler globally
    const [updatedSettings] = await sequelize.query(`
      UPDATE email_scheduler_settings
      SET enabled = FALSE, updated_at = NOW()
      WHERE setting_type = 'scheduled_reports'
      RETURNING id, setting_type, enabled
    `);
    if (updatedSettings.length > 0) {
      console.log("✅ Scheduled reports email scheduler DISABLED (no more auto report emails).");
    } else {
      console.log("ℹ️  No email_scheduler_settings row for 'scheduled_reports' (already disabled or not created).");
    }

    // 2) Find scheduled reports that send to this email
    const [rows] = await sequelize.query(`
      SELECT id, name, email_recipients, is_active
      FROM scheduled_reports
      WHERE $1 = ANY(email_recipients)
    `, { bind: [TARGET_EMAIL] });

    if (rows.length === 0) {
      console.log(`ℹ️  No scheduled reports found sending to ${TARGET_EMAIL}.`);
    } else {
      for (const row of rows) {
        const newRecipients = (row.email_recipients || []).filter((e) => e !== TARGET_EMAIL);
        await sequelize.query(`
          UPDATE scheduled_reports
          SET is_active = FALSE,
              email_recipients = $1::text[],
              updated_at = NOW()
          WHERE id = $2::uuid
        `, { bind: [newRecipients, row.id] });
        console.log(`✅ Deactivated and removed ${TARGET_EMAIL} from schedule: "${row.name}" (${row.id}).`);
      }
    }

    console.log("\n✅ Done. Auto reports to " + TARGET_EMAIL + " are stopped.");
    console.log("   To turn scheduled report emails back on (for other recipients), use Email Scheduler Settings in the dashboard.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
