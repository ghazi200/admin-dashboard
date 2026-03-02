/**
 * Test External Risk Factors Service
 * Tests with New York location using fallback (no OpenAI key)
 */

require("dotenv").config();
const externalRiskFactorsService = require("../services/externalRiskFactors.service");

async function testExternalRiskFactors() {
  console.log("🧪 Testing External Risk Factors Service (Fallback Mode)\n");
  console.log("=" .repeat(60));

  // Test 1: Location Parsing
  console.log("\n📋 Test 1: Location Parsing\n");
  
  const testLocations = [
    "New York, NY",
    "Los Angeles, California",
    "Chicago, IL",
    "123 Main St, Boston, MA",
    "Philadelphia PA",
    "Miami, FL",
  ];

  testLocations.forEach(location => {
    const parsed = externalRiskFactorsService.parseLocation(location);
    console.log(`Location: "${location}"`);
    console.log(`  → City: ${parsed?.city || "N/A"}`);
    console.log(`  → State: ${parsed?.state || "N/A"}`);
    console.log("");
  });

  // Test 2: External Risk Factors for New York
  console.log("\n📋 Test 2: External Risk Factors for New York (Fallback Mode)\n");
  
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 1); // Tomorrow

  console.log(`Testing location: "New York, NY"`);
  console.log(`Date: ${testDate.toLocaleDateString("en-US", { 
    weekday: "long", 
    year: "numeric", 
    month: "long", 
    day: "numeric" 
  })}`);
  console.log(`OpenAI Key Available: ${process.env.OPENAI_API_KEY ? "Yes" : "No (using fallback)"}\n`);

  try {
    const result = await externalRiskFactorsService.getExternalRiskFactors(
      "New York, NY",
      testDate
    );

    console.log("✅ Result received:\n");
    console.log(JSON.stringify(result, null, 2));
    
    console.log("\n📊 Summary:");
    console.log(`  - Location: ${result.location}`);
    console.log(`  - Date: ${result.date}`);
    console.log(`  - Risk Level: ${result.riskLevel}`);
    console.log(`  - Risk Score: ${result.riskScore}`);
    console.log(`  - Factors: ${result.factors?.join(", ") || "None"}`);
    console.log(`  - Source: ${result.source}`);
    console.log(`  - Summary: ${result.summary}`);

    if (result.details && Object.keys(result.details).length > 0) {
      console.log("\n📝 Details:");
      Object.entries(result.details).forEach(([key, value]) => {
        if (value) {
          console.log(`  - ${key}: ${value}`);
        }
      });
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  }

  // Test 3: Integration with Callout Risk Prediction
  console.log("\n\n📋 Test 3: Integration with Callout Risk Prediction\n");
  
  try {
    const { Sequelize, DataTypes } = require("sequelize");
    // Use DATABASE_URL if available, otherwise fall back to DB_* variables
    const databaseUrl = process.env.DATABASE_URL;
    const sequelize = databaseUrl
      ? new Sequelize(databaseUrl, {
          dialect: "postgres",
          logging: false,
        })
      : new Sequelize(
          process.env.DB_NAME,
          process.env.DB_USER,
          process.env.DB_PASS,
          {
            host: process.env.DB_HOST,
            dialect: "postgres",
            logging: false,
          }
        );

    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Create a mock shift object
    const mockShift = {
      id: "test-shift-id",
      guard_id: "test-guard-id",
      shift_date: testDate.toISOString().split('T')[0],
      shift_start: "08:00",
      shift_end: "16:00",
      location: "New York, NY",
      tenant_id: null,
      status: "OPEN",
    };

    console.log("\n📋 Mock Shift:");
    console.log(`  - Location: ${mockShift.location}`);
    console.log(`  - Date: ${mockShift.shift_date}`);
    console.log(`  - Time: ${mockShift.shift_start} - ${mockShift.shift_end}`);

    // Test external risk factors for this shift
    const externalRisk = await externalRiskFactorsService.getExternalRiskFactors(
      mockShift.location,
      new Date(mockShift.shift_date)
    );

    console.log("\n✅ External Risk Factors:");
    console.log(`  - Risk Level: ${externalRisk.riskLevel}`);
    console.log(`  - Risk Score: ${externalRisk.riskScore}`);
    console.log(`  - Factors: ${externalRisk.factors?.join(", ") || "None"}`);
    console.log(`  - Summary: ${externalRisk.summary}`);

    // Calculate how much this would add to total risk
    const externalRiskPoints = Math.round(externalRisk.riskScore * 0.3);
    console.log(`\n📊 Risk Contribution:`);
    console.log(`  - External Risk Score: ${externalRisk.riskScore}/100`);
    console.log(`  - Points Added to Total Risk: ${externalRiskPoints}/30 (max)`);
    console.log(`  - Weight: 16% of total risk calculation`);

    await sequelize.close();
  } catch (error) {
    console.error("❌ Integration test error:", error.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Test Complete!");
  console.log("\n💡 Note: With OpenAI API key, the system would:");
  console.log("   - Analyze real weather conditions");
  console.log("   - Check for actual train delays");
  console.log("   - Monitor traffic and road closures");
  console.log("   - Provide detailed risk predictions");
  console.log("\n   For now, fallback mode returns LOW risk with a message.");
  
  process.exit(0);
}

testExternalRiskFactors().catch((error) => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
