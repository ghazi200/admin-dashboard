/**
 * Payroll AI Service
 * 
 * Generates AI-powered explanations for payroll questions using DeepSeek (with OpenAI fallback)
 * Falls back to structured responses if no AI is available
 */

const { createChatClient, isChatAvailable } = require("../utils/aiClient");

// Initialize AI client (DeepSeek preferred, OpenAI fallback)
let aiConfig = null;
if (isChatAvailable()) {
  aiConfig = createChatClient();
}

/**
 * Generate AI explanation for payroll question with pay stub context
 * @param {string} question - User's question
 * @param {Object} context - Payroll context (pay stubs, timesheets, etc.)
 * @returns {Promise<{answer: string, usedAI: boolean}>}
 */
async function generatePayrollAnswer(question, context) {
  // If AI is not available, use fallback
  if (!aiConfig || !aiConfig.client) {
    return generateFallbackAnswer(question, context);
  }

  try {
    // Build system prompt
    const systemPrompt = `You are AGENT 24, a helpful payroll assistant. Your role is to:
- Explain pay stubs clearly and accurately
- Answer questions about earnings, deductions, taxes, and hours
- Be friendly, professional, and concise
- If you don't have the information, say so clearly
- Always reference specific numbers from the pay stub when explaining`;

    // Build user prompt with context
    let userPrompt = `Question: ${question}\n\n`;

    if (context.currentStub) {
      const stub = context.currentStub;
      userPrompt += `Current Pay Stub Information:\n`;
      userPrompt += `- Pay Date: ${stub.pay_date || 'N/A'}\n`;
      userPrompt += `- Pay Period: ${stub.pay_period_start || 'N/A'} to ${stub.pay_period_end || 'N/A'}\n`;
      userPrompt += `- Hours Worked: ${stub.hours_worked || 0}\n`;
      userPrompt += `- Gross Amount: $${parseFloat(stub.gross_amount || 0).toFixed(2)}\n`;
      userPrompt += `- Tax Amount: $${parseFloat(stub.tax_amount || 0).toFixed(2)}\n`;
      userPrompt += `- Deductions: $${parseFloat(stub.deductions_amount || 0).toFixed(2)}\n`;
      userPrompt += `- Net Amount: $${parseFloat(stub.net_amount || 0).toFixed(2)}\n\n`;
    }

    if (context.stubHistory && context.stubHistory.length > 0) {
      userPrompt += `Historical Pay Stubs (${context.stubHistory.length} available):\n`;
      context.stubHistory.slice(0, 3).forEach((stub, i) => {
        userPrompt += `${i + 1}. ${stub.pay_date || 'N/A'} - Net: $${parseFloat(stub.net_amount || 0).toFixed(2)}\n`;
      });
      userPrompt += `\n`;
    }

    if (context.calculatedPayroll) {
      const calc = context.calculatedPayroll;
      userPrompt += `Current Pay Period Timesheet:\n`;
      if (calc.payPeriod) {
        userPrompt += `- Period: ${calc.payPeriod.start} to ${calc.payPeriod.end}\n`;
      }
      if (calc.timesheet) {
        userPrompt += `- Regular Hours: ${calc.timesheet.regularHours || 0}\n`;
        userPrompt += `- Overtime Hours: ${calc.timesheet.overtimeHours || 0}\n`;
        userPrompt += `- Total Hours: ${calc.timesheet.totalHours || 0}\n`;
        userPrompt += `- Status: ${calc.timesheet.status || 'N/A'}\n`;
      }
      userPrompt += `\n`;
    }

    userPrompt += `Please provide a clear, helpful answer to the question. If the question is about explaining the pay stub, break down the numbers and explain what they mean.`;

    // Call AI (DeepSeek or OpenAI)
    const completion = await aiConfig.client.chat.completions.create({
      model: aiConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate an answer at this time.";

    return {
      answer: answer.trim(),
      usedAI: true,
      provider: aiConfig.provider, // Include provider info for logging
    };
  } catch (error) {
    console.error(`❌ ${aiConfig.provider.toUpperCase()} API error:`, error.message);
    // Fall back to structured response
    return generateFallbackAnswer(question, context);
  }
}

/**
 * Generate fallback answer without AI
 * @param {string} question - User's question
 * @param {Object} context - Payroll context
 * @returns {Promise<{answer: string, usedAI: boolean}>}
 */
function generateFallbackAnswer(question, context) {
  const questionLower = question.toLowerCase();
  let answer = "";

  // Check if question is about pay stub explanation
  if (context.currentStub && (
    questionLower.includes("explain") ||
    questionLower.includes("what does") ||
    questionLower.includes("break down") ||
    questionLower.includes("show me") ||
    questionLower.includes("tell me about")
  )) {
    const stub = context.currentStub;
    answer = `Here's a breakdown of your most recent pay stub:\n\n`;
    answer += `📅 **Pay Date**: ${stub.pay_date || 'N/A'}\n`;
    answer += `📆 **Pay Period**: ${stub.pay_period_start || 'N/A'} to ${stub.pay_period_end || 'N/A'}\n`;
    answer += `⏰ **Hours Worked**: ${stub.hours_worked || 0} hours\n\n`;
    answer += `💰 **Earnings Breakdown**:\n`;
    answer += `- Gross Amount: $${parseFloat(stub.gross_amount || 0).toFixed(2)} (your total earnings before deductions)\n`;
    answer += `- Tax Withheld: $${parseFloat(stub.tax_amount || 0).toFixed(2)} (federal/state taxes)\n`;
    answer += `- Other Deductions: $${parseFloat(stub.deductions_amount || 0).toFixed(2)} (insurance, retirement, etc.)\n`;
    answer += `- **Net Pay**: $${parseFloat(stub.net_amount || 0).toFixed(2)} (amount deposited to your account)\n\n`;
    answer += `The net pay is what you actually receive after all deductions are taken out.`;
  } else if (context.currentStub && questionLower.includes("pay stub")) {
    answer = `I found your most recent pay stub. It shows:\n\n`;
    answer += `- Pay Date: ${stub.pay_date || 'N/A'}\n`;
    answer += `- Hours: ${stub.hours_worked || 0}\n`;
    answer += `- Gross: $${parseFloat(stub.gross_amount || 0).toFixed(2)}\n`;
    answer += `- Net: $${parseFloat(stub.net_amount || 0).toFixed(2)}\n\n`;
    answer += `See the pay stub details displayed above. You can ask me to explain any part of it!`;
  } else if (context.currentStub) {
    answer = `I have access to your pay stub information. What would you like to know about it?\n\n`;
    answer += `You can ask me to:\n`;
    answer += `- Explain your pay stub\n`;
    answer += `- Break down the deductions\n`;
    answer += `- Show your most recent pay stub\n`;
    answer += `- Compare with previous pay periods`;
  } else {
    answer = `I'm AGENT 24, your payroll assistant. I can help you with:\n\n`;
    answer += `- Explaining your pay stubs\n`;
    answer += `- Answering questions about earnings and deductions\n`;
    answer += `- Providing pay period summaries\n\n`;
    if (context.mode === "PAYSTUB_UPLOAD" || context.mode === "HYBRID") {
      answer += `Once your administrator uploads a pay stub, I'll be able to explain it to you.`;
    } else {
      answer += `Your payroll mode is ${context.mode}. Calculated payroll features are available.`;
    }
  }

  return {
    answer: answer.trim(),
    usedAI: false,
  };
}

module.exports = {
  generatePayrollAnswer,
};
