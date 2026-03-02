/**
 * Test Command Center AI Integration
 * 
 * Tests AI features:
 * - Operational briefing generation
 * - Event tagging
 * - OpenAI connection
 */

require("dotenv").config();
const commandCenterAI = require("../services/commandCenterAI.service");

async function testCommandCenterAI() {
  console.log("🧪 Testing Command Center AI Integration\n");

  // Test 1: Check OpenAI configuration
  console.log("1️⃣ Testing OpenAI Configuration...");
  if (process.env.OPENAI_API_KEY) {
    console.log("   ✅ OPENAI_API_KEY is set");
    console.log("   Key length:", process.env.OPENAI_API_KEY.length);
    console.log("   Key prefix:", process.env.OPENAI_API_KEY.substring(0, 7) + "...");
  } else {
    console.log("   ❌ OPENAI_API_KEY not found in .env");
    console.log("   ⚠️  AI features will use template fallback");
    return;
  }

  // Test 2: Test Event Tagging
  console.log("\n2️⃣ Testing AI Event Tagging...");
  try {
    const testEvent = {
      type: "CALLOUT",
      severity: "MEDIUM",
      title: "Guard Callout",
      summary: "Guard John Doe has called out for tonight's shift due to illness",
    };

    const tags = await commandCenterAI.tagEventWithAI(testEvent);
    console.log("   ✅ Event tagged successfully");
    console.log("   Tags:", JSON.stringify(tags, null, 2));
  } catch (error) {
    console.error("   ❌ Event tagging failed:", error.message);
  }

  // Test 3: Test Operational Briefing
  console.log("\n3️⃣ Testing AI Briefing Generation...");
  try {
    const testData = {
      events: [
        {
          type: "INCIDENT",
          severity: "HIGH",
          title: "Security Breach",
          summary: "Unauthorized entry detected at Site A",
          created_at: new Date().toISOString(),
        },
        {
          type: "CALLOUT",
          severity: "MEDIUM",
          title: "Guard Callout",
          summary: "Guard called out for night shift",
          created_at: new Date().toISOString(),
        },
      ],
      atRiskShifts: [
        {
          shift: {
            shift_date: "2024-01-15",
            shift_start: "18:00",
            shift_end: "02:00",
          },
          risk: {
            riskScore: 78,
            riskLevel: "HIGH",
            factors: {
              calloutRate: { score: 25, rate: 0.4 },
              latenessRate: { score: 20, rate: 0.3 },
            },
          },
        },
      ],
      stats: {
        totalEvents: 2,
        newIncidents: 1,
        newCallouts: 1,
        openShifts: 3,
        atRiskShifts: 1,
        bySeverity: {
          HIGH: 1,
          MEDIUM: 1,
        },
      },
    };

    const context = {
      tenantId: "test-tenant",
      timeRange: "24h",
      focus: "all",
    };

    console.log("   Generating briefing...");
    const briefing = await commandCenterAI.generateOperationalBriefing(testData, context);
    
    console.log("   ✅ Briefing generated successfully");
    console.log("\n   Summary:");
    console.log("   " + briefing.summary.split("\n").join("\n   "));
    
    if (briefing.insights && briefing.insights.length > 0) {
      console.log("\n   Insights:");
      briefing.insights.forEach((insight, idx) => {
        console.log(`   ${idx + 1}. ${insight}`);
      });
    }

    if (briefing.topRisks && briefing.topRisks.length > 0) {
      console.log("\n   Top Risks:");
      briefing.topRisks.forEach((risk, idx) => {
        console.log(`   ${idx + 1}. [${risk.severity}] ${risk.title}`);
        console.log(`      ${risk.description}`);
      });
    }

    if (briefing.recommendedActions && briefing.recommendedActions.length > 0) {
      console.log("\n   Recommended Actions:");
      briefing.recommendedActions.forEach((action, idx) => {
        console.log(`   ${idx + 1}. [${action.priority}] ${action.title}`);
        console.log(`      Reason: ${action.reason}`);
        console.log(`      Confidence: ${(action.confidence * 100).toFixed(0)}%`);
      });
    }

    if (briefing.trends && Object.keys(briefing.trends).length > 0) {
      console.log("\n   Trends:");
      Object.entries(briefing.trends).forEach(([key, value]) => {
        const emoji = {
          INCREASING: "📈",
          DECREASING: "📉",
          STABLE: "➡️",
        }[value] || "➡️";
        console.log(`   ${emoji} ${key}: ${value}`);
      });
    }
  } catch (error) {
    console.error("   ❌ Briefing generation failed:", error.message);
    console.error("   Stack:", error.stack);
  }

  // Test 4: Test Shift Risk Analysis
  console.log("\n4️⃣ Testing Shift Risk Analysis...");
  try {
    const testShift = {
      shift_date: "2024-01-15",
      shift_start: "18:00",
      shift_end: "02:00",
      location: "Site A",
    };

    const context = {
      guardName: "John Doe",
      guardCalloutRate: 0.4,
      guardLatenessRate: 0.3,
      hoursUntilShiftStart: 2.5,
      siteIncidentRate: 0.2,
    };

    const analysis = await commandCenterAI.generateShiftRiskAnalysis(testShift, context);
    console.log("   ✅ Shift risk analysis generated");
    console.log("   Reasoning:", analysis.reasoning);
    console.log("   Confidence:", analysis.confidence);
    if (analysis.keyFactors) {
      console.log("   Key Factors:", analysis.keyFactors.join(", "));
    }
  } catch (error) {
    console.error("   ❌ Shift risk analysis failed:", error.message);
  }

  console.log("\n✅ AI Integration Test Complete!");
  console.log("\n💡 Next Steps:");
  console.log("   1. Restart your backend server");
  console.log("   2. Navigate to /command-center in the admin dashboard");
  console.log("   3. Click 'Generate Briefing' to see AI in action");
}

// Run tests
testCommandCenterAI()
  .then(() => {
    console.log("\n✅ All tests completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
