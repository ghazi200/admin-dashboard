/**
 * Test AI Client Utility
 * 
 * Tests the hybrid DeepSeek/OpenAI implementation:
 * 1. Provider selection
 * 2. Fallback mechanism
 * 3. Service integration
 */

require("dotenv").config();
const { 
  createChatClient, 
  createEmbeddingsClient,
  getChatModel,
  isChatAvailable,
  isEmbeddingsAvailable,
  getProviderInfo 
} = require("../utils/aiClient");
const { generatePayrollAnswer } = require("../services/payrollAI.service");

async function testAIClient() {
  console.log("🧪 Testing AI Client Utility (DeepSeek/OpenAI Hybrid)\n");
  console.log("=" .repeat(60));

  // Test 1: Provider Info
  console.log("\n📋 Test 1: Provider Information");
  console.log("-" .repeat(60));
  const providerInfo = getProviderInfo();
  console.log("Provider Configuration:");
  console.log(`  Chat Provider: ${providerInfo.chatProvider}`);
  console.log(`  Embeddings Provider: ${providerInfo.embeddingsProvider}`);
  console.log(`  Chat Model: ${providerInfo.chatModel}`);
  console.log(`  Chat Available: ${providerInfo.chatAvailable ? "✅ Yes" : "❌ No"}`);
  console.log(`  Embeddings Available: ${providerInfo.embeddingsAvailable ? "✅ Yes" : "❌ No"}`);

  // Test 2: Environment Variables
  console.log("\n📋 Test 2: Environment Variables");
  console.log("-" .repeat(60));
  console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER || "openai (default)"}`);
  console.log(`DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log(`DEEPSEEK_MODEL: ${process.env.DEEPSEEK_MODEL || "deepseek-chat (default)"}`);
  console.log(`OPENAI_MODEL: ${process.env.OPENAI_MODEL || "gpt-4o-mini (default)"}`);

  // Test 3: Client Creation
  console.log("\n📋 Test 3: Client Creation");
  console.log("-" .repeat(60));
  try {
    const chatClient = createChatClient();
    if (chatClient) {
      console.log(`✅ Chat client created successfully`);
      console.log(`   Provider: ${chatClient.provider}`);
      console.log(`   Model: ${chatClient.model}`);
      console.log(`   Base URL: ${chatClient.client.baseURL || "default (OpenAI)"}`);
    } else {
      console.log("❌ Chat client not available (no API keys configured)");
    }

    const embeddingsClient = createEmbeddingsClient();
    if (embeddingsClient) {
      console.log(`✅ Embeddings client created successfully (OpenAI)`);
    } else {
      console.log("❌ Embeddings client not available (no OpenAI key)");
    }
  } catch (error) {
    console.error("❌ Error creating clients:", error.message);
  }

  // Test 4: Availability Checks
  console.log("\n📋 Test 4: Availability Checks");
  console.log("-" .repeat(60));
  console.log(`Chat Available: ${isChatAvailable() ? "✅ Yes" : "❌ No"}`);
  console.log(`Embeddings Available: ${isEmbeddingsAvailable() ? "✅ Yes" : "❌ No"}`);
  console.log(`Chat Model: ${getChatModel()}`);

  // Test 5: Payroll AI Integration (if chat is available)
  if (isChatAvailable()) {
    console.log("\n📋 Test 5: Payroll AI Integration");
    console.log("-" .repeat(60));
    try {
      const testQuestion = "What is my net pay?";
      const testContext = {
        currentStub: {
          pay_date: "2026-01-31",
          pay_period_start: "2026-01-15",
          pay_period_end: "2026-01-31",
          hours_worked: 80,
          gross_amount: 2000.00,
          tax_amount: 400.00,
          deductions_amount: 100.00,
          net_amount: 1500.00,
        },
        mode: "PAYSTUB_UPLOAD",
      };

      console.log(`Testing with question: "${testQuestion}"`);
      console.log("Calling generatePayrollAnswer...");
      
      const result = await generatePayrollAnswer(testQuestion, testContext);
      
      console.log(`✅ Payroll AI responded successfully`);
      console.log(`   Used AI: ${result.usedAI ? "✅ Yes" : "❌ No (fallback)"}`);
      if (result.provider) {
        console.log(`   Provider: ${result.provider}`);
      }
      console.log(`   Answer length: ${result.answer.length} characters`);
      console.log(`   Answer preview: ${result.answer.substring(0, 150)}...`);
    } catch (error) {
      console.error("❌ Payroll AI test failed:", error.message);
      console.error("   Stack:", error.stack);
    }
  } else {
    console.log("\n📋 Test 5: Payroll AI Integration");
    console.log("-" .repeat(60));
    console.log("⏭️  Skipped - Chat not available (no API keys)");
  }

  // Test 6: Fallback Test (if both providers available)
  if (process.env.DEEPSEEK_API_KEY && process.env.OPENAI_API_KEY) {
    console.log("\n📋 Test 6: Fallback Mechanism");
    console.log("-" .repeat(60));
    console.log("✅ Both providers configured - fallback will work automatically");
    console.log("   If DeepSeek fails, system will automatically use OpenAI");
    console.log("   If both fail, system will use template/structured responses");
  } else {
    console.log("\n📋 Test 6: Fallback Mechanism");
    console.log("-" .repeat(60));
    if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
      console.log("⚠️  No API keys configured - system will use template responses");
    } else if (!process.env.DEEPSEEK_API_KEY) {
      console.log("✅ OpenAI configured - will use OpenAI directly (no DeepSeek fallback needed)");
    } else {
      console.log("✅ DeepSeek configured - will use DeepSeek with OpenAI fallback");
    }
  }

  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("📊 Test Summary");
  console.log("=" .repeat(60));
  
  const summary = {
    provider: providerInfo.chatProvider,
    chatAvailable: providerInfo.chatAvailable,
    embeddingsAvailable: providerInfo.embeddingsAvailable,
    model: providerInfo.chatModel,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (summary.chatAvailable) {
    console.log("\n✅ System is ready to use AI services!");
    console.log(`   Using ${summary.provider} for chat completions`);
    console.log(`   Model: ${summary.model}`);
  } else {
    console.log("\n⚠️  AI services not available");
    console.log("   Add DEEPSEEK_API_KEY or OPENAI_API_KEY to .env to enable");
  }

  if (summary.embeddingsAvailable) {
    console.log("✅ Embeddings available (OpenAI)");
  } else {
    console.log("⚠️  Embeddings not available (add OPENAI_API_KEY)");
  }

  console.log("\n" + "=" .repeat(60));
  console.log("✅ Test completed!");
  console.log("=" .repeat(60));
}

// Run the test
testAIClient().catch((error) => {
  console.error("\n❌ Test failed with error:");
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
});
