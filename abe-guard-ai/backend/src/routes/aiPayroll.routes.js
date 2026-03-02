/**
 * AI Payroll Routes
 * 
 * Single endpoint that adapts by mode:
 * POST /api/ai/payroll/ask
 * 
 * Detects mode, pulls the right data, calls AI agent with structured context
 */

const express = require("express");
const auth = require("../middleware/auth"); // Admin auth (sets req.admin)
const guardAuth = require("../middleware/guardAuth"); // Guard auth (sets req.user)
const requireAiPayrollEnabled = require("../middleware/requireAiPayrollEnabled");
const timesheetService = require("../services/timesheet.service");
const payrollCalculator = require("../services/payrollCalculator.service");
const payrollAI = require("../services/payrollAI.service");

const router = express.Router();

// Allow either guard or admin authentication
function authEither(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  try {
    const jwt = require("jsonwebtoken");
    const token = hdr.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if it's an admin token (has adminId)
    if (decoded.adminId || (decoded.id && decoded.role === "admin")) {
      // Use admin auth flow
      const adminId = decoded.adminId ?? decoded.id;
      req.admin = {
        id: adminId,
        role: decoded.role || "admin",
        permissions: decoded.permissions || [],
      };
      req.user = req.admin;
      req.user.tenant_id = decoded.tenant_id || null;
      return next();
    }

    // Check if it's a guard token (has guardId)
    if (decoded.guardId || (decoded.id && decoded.role === "guard")) {
      // Use guard auth flow
      const guardId = decoded.guardId ?? decoded.id;
      req.user = {
        id: guardId,
        guardId,
        tenant_id: decoded.tenant_id || null,
        role: decoded.role || "guard",
        permissions: decoded.permissions || [],
      };
      return next();
    }

    return res.status(401).json({ message: "Invalid token (not admin or guard)" });
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token", error: e.message });
  }
}

router.use(authEither);
router.use(requireAiPayrollEnabled);

/**
 * POST /api/ai/payroll/ask
 * Mode-aware payroll questions
 */
router.post("/ask", async (req, res) => {
  try {
    const mode = req.tenant.payroll_mode; // PAYSTUB_UPLOAD | CALCULATED | HYBRID
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ message: "Missing question" });

    // Determine actor (admin or guard)
    const actor = req.admin
      ? { type: "admin", id: req.admin.id, role: req.admin.role || "admin" }
      : { type: "guard", id: req.user?.id || req.user?.guardId, role: "guard" };

    // ---- Mode-aware data gathering (safe stubs now, calculated later) ----
    const ctx = { mode, actor, question, tenantId: req.tenant.id };

    const { PayStub } = req.app.locals.models;

    // In A or HYBRID: include pay stub context
    if (mode === "PAYSTUB_UPLOAD" || mode === "HYBRID") {
      if (actor.type === "guard") {
        // Guard sees their own current and historical stubs
        const guardId = req.user?.id || req.user?.guardId;
        const currentStub = await PayStub.findOne({
          where: { tenant_id: req.tenant.id, guard_id: guardId },
          order: [["pay_date", "DESC"]],
        });
        const stubHistory = await PayStub.findAll({
          where: { tenant_id: req.tenant.id, guard_id: guardId },
          order: [["pay_date", "DESC"]],
          limit: 10,
        });
        
        // Convert Sequelize models to plain objects for JSON response
        ctx.currentStub = currentStub ? currentStub.toJSON() : null;
        ctx.stubHistory = stubHistory.map(s => s.toJSON());
      } else {
        // Admin may pass a guard_id for explanation
        const guardId = req.body.guard_id;
        if (guardId) {
          const currentStub = await PayStub.findOne({
            where: { tenant_id: req.tenant.id, guard_id: guardId },
            order: [["pay_date", "DESC"]],
          });
          ctx.currentStub = currentStub ? currentStub.toJSON() : null;
        }
      }
    }

    // In B or HYBRID: include calculated payroll context
    if (mode === "CALCULATED" || mode === "HYBRID") {
      if (actor.type === "guard") {
        // Guard sees their own calculated timesheet data
        const guardId = req.user?.id || req.user?.guardId;

        // Get current pay period
        const currentPayPeriod = await timesheetService.getCurrentPayPeriod(req.tenant.id);
        
        if (currentPayPeriod) {
          // Get or generate current timesheet
          let timesheet = await timesheetService.getCurrentTimesheet(guardId, req.tenant.id);
          
          // If no timesheet exists, generate it from time entries
          if (!timesheet) {
            try {
              timesheet = await timesheetService.generateTimesheet(guardId, currentPayPeriod.id, req.tenant.id);
            } catch (genError) {
              console.warn("Could not generate timesheet:", genError.message);
              // Continue with null timesheet - user may not have time entries yet
            }
          }

          if (timesheet) {
            // Get timesheet lines for detailed breakdown
            const timesheetLines = await timesheetService.getTimesheetLines(timesheet.id);
            
            // Build OT breakdown from timesheet lines
            let otBreakdown = null;
            if (timesheetLines && timesheetLines.length > 0) {
              otBreakdown = {
                timesheet_id: timesheet.id,
                byDay: timesheetLines.map(line => ({
                  date: line.date,
                  regularHours: parseFloat(line.regular_hours || 0),
                  overtimeHours: parseFloat(line.overtime_hours || 0),
                  doubleTimeHours: parseFloat(line.double_time_hours || 0),
                  premiumHours: parseFloat(line.premium_hours || 0),
                  premiumType: line.premium_type,
                  hasException: line.has_exception,
                  exceptionType: line.exception_type,
                })),
                totals: {
                  regular: parseFloat(timesheet.regular_hours || 0),
                  overtime: parseFloat(timesheet.overtime_hours || 0),
                  doubleTime: parseFloat(timesheet.double_time_hours || 0),
                  total: parseFloat(timesheet.total_hours || 0),
                },
              };
            }

            ctx.calculatedPayroll = {
              payPeriod: {
                id: currentPayPeriod.id,
                start: currentPayPeriod.period_start,
                end: currentPayPeriod.period_end,
                type: currentPayPeriod.period_type,
                status: currentPayPeriod.status,
              },
              timesheet: {
                id: timesheet.id,
                regularHours: parseFloat(timesheet.regular_hours || 0),
                overtimeHours: parseFloat(timesheet.overtime_hours || 0),
                doubleTimeHours: parseFloat(timesheet.double_time_hours || 0),
                totalHours: parseFloat(timesheet.total_hours || 0),
                status: timesheet.status,
                exceptionsCount: timesheet.exceptions_count || 0,
                exceptions: timesheet.exceptions_json || [],
                calculatedAt: timesheet.calculated_at,
              },
              otBreakdown,
              approvalsStatus: {
                isApproved: timesheet.status === "APPROVED",
                isSubmitted: timesheet.status === "SUBMITTED",
                approvedBy: timesheet.approved_by_admin_id,
                approvedAt: timesheet.approved_at,
                submittedAt: timesheet.submitted_at,
              },
            };
          } else {
            // No timesheet yet - user may not have time entries for this period
            ctx.calculatedPayroll = {
              payPeriod: {
                id: currentPayPeriod.id,
                start: currentPayPeriod.period_start,
                end: currentPayPeriod.period_end,
                type: currentPayPeriod.period_type,
                status: currentPayPeriod.status,
              },
              timesheet: null,
              note: "No timesheet found for this pay period. Time entries may not exist yet.",
            };
          }
        } else {
          // No active pay period
          ctx.calculatedPayroll = {
            payPeriod: null,
            timesheet: null,
            note: "No active pay period found for this tenant.",
          };
        }
      } else {
        // Admin may pass a guard_id for explanation
        const guardId = req.body.guard_id;
        if (guardId) {
          // Similar logic as above, but for specific guard_id
          const currentPayPeriod = await timesheetService.getCurrentPayPeriod(req.tenant.id);
          
          if (currentPayPeriod) {
            let timesheet = await timesheetService.getCurrentTimesheet(guardId, req.tenant.id);
            
            if (timesheet) {
              const timesheetLines = await timesheetService.getTimesheetLines(timesheet.id);
              
              ctx.calculatedPayroll = {
                payPeriod: {
                  id: currentPayPeriod.id,
                  start: currentPayPeriod.period_start,
                  end: currentPayPeriod.period_end,
                  type: currentPayPeriod.period_type,
                  status: currentPayPeriod.status,
                },
                timesheet: {
                  id: timesheet.id,
                  regularHours: parseFloat(timesheet.regular_hours || 0),
                  overtimeHours: parseFloat(timesheet.overtime_hours || 0),
                  doubleTimeHours: parseFloat(timesheet.double_time_hours || 0),
                  totalHours: parseFloat(timesheet.total_hours || 0),
                  status: timesheet.status,
                  exceptionsCount: timesheet.exceptions_count || 0,
                  exceptions: timesheet.exceptions_json || [],
                },
                approvalsStatus: {
                  isApproved: timesheet.status === "APPROVED",
                  approvedBy: timesheet.approved_by_admin_id,
                  approvedAt: timesheet.approved_at,
                },
              };
            } else {
              ctx.calculatedPayroll = {
                payPeriod: {
                  id: currentPayPeriod.id,
                  start: currentPayPeriod.period_start,
                  end: currentPayPeriod.period_end,
                },
                timesheet: null,
              };
            }
          }
        }
      }
    }

    // Policies (RAG) can be added here later (same in all modes)
    // ctx.policySnippets = await fetchPolicySnippets(question, req.tenant.id);

    // ---- Call AI agent to generate answer ----
    const { answer, usedAI } = await payrollAI.generatePayrollAnswer(question, ctx);

    return res.json({
      ok: true,
      answer,
      contextUsed: ctx,
      usedAI, // Indicates if OpenAI was used
    });

  } catch (e) {
    console.error("askPayroll error:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
