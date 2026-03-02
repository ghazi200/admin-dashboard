/**
 * Test script for Payroll AI feature
 * Tests if the AI service can generate answers with pay stub context
 */

// Run from abe-guard-ai/backend directory
const path = require('path');
process.chdir(path.join(__dirname, '../abe-guard-ai/backend'));
require('dotenv').config();
const payrollAI = require('./src/services/payrollAI.service');

async function testPayrollAI() {
  console.log('🧪 Testing Payroll AI Service...\n');

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

  const testQuestions = [
    'Show me my most recent pay stub and explain it',
    'What does my pay stub mean?',
    'Break down my deductions',
    'Explain my gross vs net pay',
  ];

  for (const question of testQuestions) {
    console.log(`\n📝 Question: "${question}"`);
    console.log('─'.repeat(60));
    
    try {
      const result = await payrollAI.generatePayrollAnswer(question, mockContext);
      console.log(`✅ Answer (AI: ${result.usedAI ? 'Yes' : 'No'}):`);
      console.log(result.answer);
      console.log('');
    } catch (error) {
      console.error(`❌ Error:`, error.message);
    }
  }

  console.log('\n✅ Test completed!');
}

// Run test
testPayrollAI().catch(console.error);
