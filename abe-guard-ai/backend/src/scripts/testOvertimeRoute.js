/**
 * Quick test to verify overtime route is accessible
 */
require("dotenv").config();
const axios = require("axios");

async function testRoute() {
  const baseURL = process.env.ABE_GUARD_AI_URL || "http://localhost:4000";
  
  console.log("🧪 Testing Overtime Routes\n");
  console.log(`Base URL: ${baseURL}\n`);

  // Test without auth (should get 401, not 404)
  try {
    console.log("1️⃣ Testing GET /api/guard/overtime/offers (no auth)...");
    const response = await axios.get(`${baseURL}/api/guard/overtime/offers`, {
      validateStatus: () => true, // Don't throw on any status
    });
    console.log(`   Status: ${response.status}`);
    if (response.status === 404) {
      console.log("   ❌ Route not found! Check route registration.");
    } else if (response.status === 401) {
      console.log("   ✅ Route exists (401 = auth required, which is correct)");
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
    }
  } catch (err) {
    console.error("   ❌ Error:", err.message);
  }

  console.log("\n💡 If you see 404, the server may need to be restarted.");
  console.log("💡 If you see 401, the route is working (just needs auth).");
}

testRoute();
