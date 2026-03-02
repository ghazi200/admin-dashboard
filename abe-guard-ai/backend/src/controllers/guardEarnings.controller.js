const { pool } = require("../config/db");
const timesheetService = require("../services/timesheet.service");

/**
 * GET /api/guard/earnings
 * Returns comprehensive earnings tracker data for the authenticated guard
 * Includes: Real-time earnings, pay period summaries, tax estimates, payment history
 */
exports.getGuardEarnings = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    const tenantId = req.user?.tenant_id || req.tenant?.id;

    // Get all data in parallel
    const [
      timeEntriesResult,
      payStubsResult,
      currentPayPeriodResult
    ] = await Promise.all([
      // Get all time entries for earnings calculation
      pool.query(
        `SELECT id, shift_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
         FROM public.time_entries
         WHERE guard_id = $1
         ORDER BY clock_in_at DESC`,
        [guardId]
      ),
      // Get pay stub history (payment history)
      pool.query(
        `SELECT id, pay_date, pay_period_start, pay_period_end, 
                hours_worked, gross_amount, tax_amount, deductions_amount, net_amount,
                file_url, file_name, created_at
         FROM public.pay_stubs
         WHERE guard_id = $1 ${tenantId ? 'AND tenant_id = $2' : ''}
         ORDER BY pay_date DESC
         LIMIT 12`,
        tenantId ? [guardId, tenantId] : [guardId]
      ).catch(() => ({ rows: [] })), // Ignore if table doesn't exist
      // Get current pay period (if available)
      tenantId ? timesheetService.getCurrentPayPeriod(tenantId).catch(() => null) : Promise.resolve(null)
    ]);

    const timeEntries = timeEntriesResult?.rows || [];
    const payStubs = payStubsResult?.rows || [];
    const currentPayPeriod = currentPayPeriodResult;

    // Calculate real-time earnings
    const realTimeEarnings = calculateRealTimeEarnings(timeEntries);

    // Calculate pay period summaries
    const payPeriodSummaries = calculatePayPeriodSummaries(timeEntries, currentPayPeriod);

    // Estimate tax withholding
    const taxEstimates = estimateTaxWithholding(realTimeEarnings, payStubs);

    // Payment history from pay stubs
    const paymentHistory = formatPaymentHistory(payStubs);

    return res.json({
      realTimeEarnings,
      payPeriodSummaries,
      taxEstimates,
      paymentHistory,
      currentPayPeriod: currentPayPeriod ? {
        id: currentPayPeriod.id,
        start: currentPayPeriod.period_start,
        end: currentPayPeriod.period_end,
        type: currentPayPeriod.period_type,
        status: currentPayPeriod.status
      } : null
    });
  } catch (err) {
    console.error("Get guard earnings error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ 
      error: "Server error", 
      message: err.message
    });
  }
};

/**
 * Calculate real-time earnings from time entries
 */
function calculateRealTimeEarnings(timeEntries) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Calculate hours from time entries
  function calculateHours(entries) {
    return entries.reduce((total, te) => {
      if (te.clock_in_at && te.clock_out_at) {
        const start = new Date(te.clock_in_at);
        const end = new Date(te.clock_out_at);
        const hours = (end - start) / (1000 * 60 * 60);
        
        // Subtract break time if applicable
        if (te.lunch_start_at && te.lunch_end_at) {
          const breakStart = new Date(te.lunch_start_at);
          const breakEnd = new Date(te.lunch_end_at);
          const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
          return total + Math.max(0, hours - breakHours);
        }
        
        return total + Math.max(0, hours);
      }
      return total;
    }, 0);
  }

  const thisWeekEntries = timeEntries.filter(te => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= startOfWeek;
  });

  const thisMonthEntries = timeEntries.filter(te => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= startOfMonth;
  });

  const thisYearEntries = timeEntries.filter(te => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= startOfYear;
  });

  const thisWeekHours = calculateHours(thisWeekEntries);
  const thisMonthHours = calculateHours(thisMonthEntries);
  const thisYearHours = calculateHours(thisYearEntries);
  const totalHours = calculateHours(timeEntries);

  // Estimate earnings (if hourly rate is available, multiply; otherwise show hours only)
  // For now, we'll return hours. If hourly rate is in database, we can add it later.
  const estimatedHourlyRate = 20; // Default estimate - can be fetched from guard profile or tenant settings

  return {
    thisWeek: {
      hours: Math.round(thisWeekHours * 10) / 10,
      estimatedEarnings: Math.round(thisWeekHours * estimatedHourlyRate * 10) / 10
    },
    thisMonth: {
      hours: Math.round(thisMonthHours * 10) / 10,
      estimatedEarnings: Math.round(thisMonthHours * estimatedHourlyRate * 10) / 10
    },
    thisYear: {
      hours: Math.round(thisYearHours * 10) / 10,
      estimatedEarnings: Math.round(thisYearHours * estimatedHourlyRate * 10) / 10
    },
    total: {
      hours: Math.round(totalHours * 10) / 10,
      estimatedEarnings: Math.round(totalHours * estimatedHourlyRate * 10) / 10
    }
  };
}

/**
 * Calculate pay period summaries
 */
function calculatePayPeriodSummaries(timeEntries, currentPayPeriod) {
  if (!currentPayPeriod) {
    return {
      current: null,
      recent: []
    };
  }

  const periodStart = new Date(currentPayPeriod.period_start);
  const periodEnd = new Date(currentPayPeriod.period_end);

  // Filter entries in current pay period
  const currentPeriodEntries = timeEntries.filter(te => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= periodStart && entryDate <= periodEnd;
  });

  // Calculate hours for current period
  const currentPeriodHours = currentPeriodEntries.reduce((total, te) => {
    if (te.clock_in_at && te.clock_out_at) {
      const start = new Date(te.clock_in_at);
      const end = new Date(te.clock_out_at);
      const hours = (end - start) / (1000 * 60 * 60);
      
      if (te.lunch_start_at && te.lunch_end_at) {
        const breakStart = new Date(te.lunch_start_at);
        const breakEnd = new Date(te.lunch_end_at);
        const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
        return total + Math.max(0, hours - breakHours);
      }
      
      return total + Math.max(0, hours);
    }
    return total;
  }, 0);

  const estimatedHourlyRate = 20; // Default estimate

  return {
    current: {
      payPeriodId: currentPayPeriod.id,
      start: currentPayPeriod.period_start,
      end: currentPayPeriod.period_end,
      type: currentPayPeriod.period_type,
      hours: Math.round(currentPeriodHours * 10) / 10,
      estimatedEarnings: Math.round(currentPeriodHours * estimatedHourlyRate * 10) / 10,
      status: currentPayPeriod.status
    },
    recent: [] // Can be populated with past pay periods if needed
  };
}

/**
 * Estimate tax withholding based on earnings and historical pay stubs
 */
function estimateTaxWithholding(realTimeEarnings, payStubs) {
  // Calculate average tax rate from pay stubs
  let averageTaxRate = 0.15; // Default 15% if no pay stubs
  
  if (payStubs.length > 0) {
    const totalGross = payStubs.reduce((sum, stub) => sum + (parseFloat(stub.gross_amount) || 0), 0);
    const totalTax = payStubs.reduce((sum, stub) => sum + (parseFloat(stub.tax_amount) || 0), 0);
    
    if (totalGross > 0) {
      averageTaxRate = totalTax / totalGross;
    }
  }

  // Estimate for current month
  const monthlyGross = realTimeEarnings.thisMonth.estimatedEarnings;
  const estimatedTax = monthlyGross * averageTaxRate;
  const estimatedNet = monthlyGross - estimatedTax;

  // Estimate for current year
  const yearlyGross = realTimeEarnings.thisYear.estimatedEarnings;
  const estimatedYearlyTax = yearlyGross * averageTaxRate;
  const estimatedYearlyNet = yearlyGross - estimatedYearlyTax;

  return {
    averageTaxRate: Math.round(averageTaxRate * 10000) / 100, // Percentage with 2 decimals
    thisMonth: {
      gross: monthlyGross,
      estimatedTax: Math.round(estimatedTax * 10) / 10,
      estimatedNet: Math.round(estimatedNet * 10) / 10
    },
    thisYear: {
      gross: yearlyGross,
      estimatedTax: Math.round(estimatedYearlyTax * 10) / 10,
      estimatedNet: Math.round(estimatedYearlyNet * 10) / 10
    }
  };
}

/**
 * Format payment history from pay stubs
 */
function formatPaymentHistory(payStubs) {
  return payStubs.map(stub => ({
    id: stub.id,
    payDate: stub.pay_date,
    payPeriodStart: stub.pay_period_start,
    payPeriodEnd: stub.pay_period_end,
    hoursWorked: parseFloat(stub.hours_worked) || 0,
    grossAmount: parseFloat(stub.gross_amount) || 0,
    taxAmount: parseFloat(stub.tax_amount) || 0,
    deductionsAmount: parseFloat(stub.deductions_amount) || 0,
    netAmount: parseFloat(stub.net_amount) || 0,
    fileUrl: stub.file_url,
    fileName: stub.file_name,
    createdAt: stub.created_at
  }));
}
