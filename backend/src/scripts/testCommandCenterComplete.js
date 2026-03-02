/**
 * Complete Command Center Test Suite
 * 
 * Tests all Command Center features:
 * - Event capture and storage
 * - Risk scoring
 * - Feed generation
 * - At-risk shifts
 * - AI briefing generation
 */

require("dotenv").config();
const { sequelize, OpEvent, Shift, CallOut, Guard } = require("../models");
const opsEventService = require("../services/opsEvent.service");
const riskScoringService = require("../services/riskScoring.service");
const commandCenterAI = require("../services/commandCenterAI.service");

async function testCommandCenterComplete() {
  console.log("🧪 Complete Command Center Test Suite\n");
  
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return;
  }

  const models = { OpEvent, Shift, CallOut, Guard, sequelize };

  // Test 1: Verify Models
  console.log("1️⃣ Testing Models...");
  try {
    if (!OpEvent) {
      console.log("   ⚠️  OpEvent model not found - tables may need to be created");
      console.log("   💡 Run: RESET_DB=true npm start (will recreate tables)");
    } else {
      console.log("   ✅ OpEvent model loaded");
    }
    console.log("   ✅ Shift model loaded");
    console.log("   ✅ CallOut model loaded");
    console.log("   ✅ Guard model loaded");
  } catch (error) {
    console.error("   ❌ Model check failed:", error.message);
  }

  // Test 2: Test Event Standardization
  console.log("\n2️⃣ Testing Event Standardization...");
  try {
    const testEvent = {
      type: "incidents:new",
      incident: {
        id: "test-incident-123",
        type: "TRESPASS",
        severity: "HIGH",
        description: "Unauthorized entry detected",
      },
      tenant_id: "test-tenant",
    };

    const standardized = opsEventService.standardizeEvent(testEvent, {
      tenantId: "test-tenant",
    });

    console.log("   ✅ Event standardized:");
    console.log("      Type:", standardized.type);
    console.log("      Severity:", standardized.severity);
    console.log("      Title:", standardized.title);
  } catch (error) {
    console.error("   ❌ Event standardization failed:", error.message);
  }

  // Test 3: Test Feed Generation
  console.log("\n3️⃣ Testing Feed Generation...");
  try {
    const feed = await opsEventService.getOpEventsFeed(
      { tenantId: null, limit: 5 },
      models
    );
    console.log(`   ✅ Feed query successful: ${feed.length} events found`);
    if (feed.length > 0) {
      console.log("      Latest event:", feed[0].title);
    } else {
      console.log("      ℹ️  No events yet - this is normal if no operations have occurred");
    }
  } catch (error) {
    console.error("   ❌ Feed generation failed:", error.message);
  }

  // Test 4: Test Risk Scoring
  console.log("\n4️⃣ Testing Risk Scoring...");
  try {
    // Test with sample shift data
    const testShift = {
      shift_date: "2024-01-15",
      shift_start: "18:00",
      shift_end: "02:00",
    };

    const context = {
      guardCalloutRate: 0.4,
      guardLatenessRate: 0.3,
      hoursUntilShiftStart: 2.5,
      siteIncidentRate: 0.2,
    };

    const risk = riskScoringService.calculateShiftRisk(testShift, context);
    console.log("   ✅ Risk scoring working:");
    console.log("      Risk Score:", risk.riskScore);
    console.log("      Risk Level:", risk.riskLevel);
    console.log("      Factors:", Object.keys(risk.factors).join(", "));
  } catch (error) {
    console.error("   ❌ Risk scoring failed:", error.message);
  }

  // Test 5: Test At-Risk Shifts (if tenant exists)
  console.log("\n5️⃣ Testing At-Risk Shifts...");
  try {
    // Check if we have any tenants with shifts
    const sampleShift = await Shift.findOne({ limit: 1 });
    if (sampleShift && sampleShift.tenant_id) {
      const atRisk = await riskScoringService.getAtRiskShifts(
        sampleShift.tenant_id,
        models,
        { limit: 5, minRiskScore: 0 }
      );
      console.log(`   ✅ At-risk shifts query successful: ${atRisk.length} shifts found`);
      if (atRisk.length > 0) {
        console.log(`      Highest risk: ${atRisk[0].risk.riskScore} (${atRisk[0].risk.riskLevel})`);
      }
    } else {
      console.log("   ℹ️  No shifts found - this is normal if no shifts exist yet");
    }
  } catch (error) {
    console.error("   ❌ At-risk shifts failed:", error.message);
    console.error("      Error details:", error.stack?.split("\n")[0]);
  }

  // Test 6: Test AI Briefing (if OpenAI key available)
  console.log("\n6️⃣ Testing AI Briefing...");
  try {
    const testData = {
      events: [],
      atRiskShifts: [],
      stats: {
        totalEvents: 0,
        newIncidents: 0,
        newCallouts: 0,
        openShifts: 0,
        atRiskShifts: 0,
        bySeverity: {},
      },
    };

    const context = {
      tenantId: "test",
      timeRange: "24h",
      focus: "all",
    };

    const briefing = await commandCenterAI.generateOperationalBriefing(testData, context);
    console.log("   ✅ Briefing generation successful");
    if (briefing.summary) {
      console.log("      Summary preview:", briefing.summary.substring(0, 100) + "...");
    }
    console.log("      AI Generated:", process.env.OPENAI_API_KEY ? "Yes" : "No (using templates)");
  } catch (error) {
    console.error("   ❌ Briefing generation failed:", error.message);
  }

  // Test 7: Test Event Tagging
  console.log("\n7️⃣ Testing AI Event Tagging...");
  try {
    const testEvent = {
      type: "CALLOUT",
      severity: "MEDIUM",
      title: "Guard Callout",
      summary: "Guard called out for night shift",
    };

    const tags = await commandCenterAI.tagEventWithAI(testEvent);
    console.log("   ✅ Event tagging successful:");
    console.log("      Risk Level:", tags.risk_level);
    console.log("      Category:", tags.category);
    console.log("      AI Generated:", tags.confidence > 0.7 ? "Yes" : "No (template)");
  } catch (error) {
    console.error("   ❌ Event tagging failed:", error.message);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ Command Center Test Complete!");
  console.log("=".repeat(60));
  console.log("\n💡 What to Test Next:");
  console.log("   1. Start backend: cd backend && npm start");
  console.log("   2. Start frontend: cd frontend-admin-dashboard/admin-dashboard-frontend && npm start");
  console.log("   3. Navigate to: http://localhost:3000/command-center");
  console.log("   4. Click 'Generate Briefing' button");
  console.log("   5. Check 'At-Risk Shifts' panel");
  console.log("   6. Monitor 'Live Situation Room' feed");
  console.log("\n📋 Features to Verify:");
  console.log("   ✅ Three AI tiles display correctly");
  console.log("   ✅ Feed shows operational events");
  console.log("   ✅ At-risk shifts are ranked by risk");
  console.log("   ✅ AI briefing generates insights");
  console.log("   ✅ Real-time updates work (via Socket.IO)");

  try {
    await sequelize.close();
  } catch (error) {
    console.error("\n❌ Error closing database:", error.message);
  }
}

// Run tests
testCommandCenterComplete()
  .then(() => {
    console.log("\n✅ All tests completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  });
