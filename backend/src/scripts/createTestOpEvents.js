/**
 * Create Test OpEvents
 * 
 * Creates sample operational events for testing the RAG query system
 */

require("dotenv").config();
const { sequelize, OpEvent } = require("../models");
const { DEFAULT_TEST_TENANT_ID } = require("../config/tenantConfig");

async function createTestOpEvents() {
  console.log("🧪 Creating test OpEvents...\n");

  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }

  // Sample tenant ID (use default or from env)
  const tenantId = process.env.TEST_TENANT_ID || DEFAULT_TEST_TENANT_ID;

  const testEvents = [
    {
      tenant_id: tenantId,
      type: "INCIDENT",
      severity: "HIGH",
      title: "Security Breach at Site A",
      summary: "Unauthorized entry detected at Site A main entrance at 2:30 AM. Security guard responded immediately.",
      entity_refs: { incident_id: "test-incident-1" },
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    },
    {
      tenant_id: tenantId,
      type: "CALLOUT",
      severity: "MEDIUM",
      title: "Guard Callout - Night Shift",
      summary: "Guard John Doe called out for tonight's shift due to illness. Backup guard assigned.",
      entity_refs: { guard_id: "test-guard-1", shift_id: "test-shift-1" },
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    },
    {
      tenant_id: tenantId,
      type: "INCIDENT",
      severity: "CRITICAL",
      title: "Fire Alarm Activation",
      summary: "Fire alarm activated at Site B. Fire department responded. False alarm after investigation.",
      entity_refs: { incident_id: "test-incident-2" },
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
    {
      tenant_id: tenantId,
      type: "SHIFT",
      severity: "LOW",
      title: "Unassigned Shift - High Risk",
      summary: "Night shift at Site A remains unassigned. Shift starts in 4 hours.",
      entity_refs: { shift_id: "test-shift-2" },
      created_at: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    },
    {
      tenant_id: tenantId,
      type: "INSPECTION",
      severity: "MEDIUM",
      title: "Inspection Overdue",
      summary: "Lobby inspection overdue by 15 minutes. Guard notified to complete inspection.",
      entity_refs: { inspection_id: "test-inspection-1" },
      created_at: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
    },
  ];

  try {
    for (const event of testEvents) {
      const created = await OpEvent.create(event);
      console.log(`✅ Created: ${created.type} - ${created.title}`);
    }

    console.log(`\n✅ Created ${testEvents.length} test OpEvents for tenant: ${tenantId}`);
    console.log("\n💡 You can now test RAG queries like:");
    console.log('   - "What incidents occurred?"');
    console.log('   - "Show me recent callouts"');
    console.log('   - "What happened this week?"');
    console.log('   - "Any high-risk shifts?"');
  } catch (error) {
    console.error("❌ Error creating test events:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await sequelize.close();
  }
}

createTestOpEvents()
  .then(() => {
    console.log("\n✅ Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
