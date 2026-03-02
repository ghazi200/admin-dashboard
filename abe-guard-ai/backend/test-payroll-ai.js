/**
 * Test script for Payroll AI feature
 * Run from backend directory: node test-payroll-ai.js
 */

require('dotenv').config();
const payrollAI = require('./src/services/payrollAI.service');

async function testPayrollAI() {
  console.log('🧪 Testing Payroll AI Service...\n');
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set (will use fallback)'}\n`);

  // Mock pay stub context
  const mockContext = {
    mode: 'PAYSTUB_UPLOAD',
    currentStub: {
      id: 'test-stub-1',
      pay_date: '2024-01-15',
      pay_period_start: '2024-01-01',
      pay_period_end: '2024-01-15',
      hours_worked: 80,
      gross_amount: 2000.00,
      tax_amount: 300.00,
      deductions_amount: 100.00,
      net_amount: 1600.00,
    },
    stubHistory: [],
  };

  const testQuestion = 'Show me my most recent pay stub and explain it';
  
  console.log(`📝 Question: "${testQuestion}"`);
  console.log('─'.repeat(60));
  
  try {
    const result = await payrollAI.generatePayrollAnswer(testQuestion, mockContext);
    console.log(`\n✅ Answer Generated (AI: ${result.usedAI ? 'Yes' : 'No - Using Fallback'}):`);
    console.log('─'.repeat(60));
    console.log(result.answer);
    console.log('─'.repeat(60));
    console.log(`\n✅ Test completed successfully!`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    console.error(error.stack);
  }
}

// Run test
testPayrollAI().catch(console.error);
