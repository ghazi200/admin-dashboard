/**
 * Middleware: requireAIPayroll
 * 
 * Design Rules:
 * 1. AI is available in all modes (PAYSTUB_UPLOAD, CALCULATED, HYBRID)
 * 2. Mode controls what data sources AI can access:
 *    
 *    PAYSTUB_UPLOAD (Mode A):
 *    ✓ AI can: explain uploaded pay stub fields (net, taxes, hours, dates)
 *              answer related questions using policies (RAG)
 *              show history summaries
 *    ✗ AI cannot: claim to "calculate payroll" (unless optional informational summaries from time entries enabled)
 *    
 *    CALCULATED (Mode B):
 *    ✓ AI can: analyze calculated timesheets, exceptions, OT, premiums
 *              explain why totals are what they are (based on engine outputs)
 *              recommend what to review (missing punches, anomalies)
 *    ℹ️ AI can optionally: compare with uploaded stubs if stored (but in B-only you may hide stubs)
 *    
 *    HYBRID:
 *    ✓ AI can: do everything from Mode A + Mode B
 *              compare stub hours vs app-calculated hours
 *              flag mismatches and suggest follow-ups
 * 
 * 3. If ai_payroll_enabled = false → block all AI payroll endpoints
 * 
 * Usage:
 *   router.use(requireAIPayroll());
 *   // Then in route handler, access req.aiPayrollTools
 * 
 * After this middleware:
 *   - req.tenant is set (tenant object)
 *   - req.aiPayrollEnabled is set (boolean)
 *   - req.aiPayrollMode is set (string: 'PAYSTUB_UPLOAD' | 'CALCULATED' | 'HYBRID')
 *   - req.aiPayrollTools is set (object with available data sources)
 */

module.exports = function requireAIPayroll(opts = {}) {
  const actor = opts.actor || "admin"; // "admin" | "guard"

  return async function (req, res, next) {
    try {
      // ✅ Step 1: Get tenant (same logic as requirePayrollMode, but we check ai_payroll_enabled instead)
      let tenantId = null;

      if (actor === "admin") {
        const role = req.admin?.role || req.user?.role;
        const isSuperAdmin = role === "super_admin";

        if (isSuperAdmin) {
          tenantId =
            req.query?.tenantId ||
            req.headers["x-tenant-id"] ||
            req.admin?.tenant_id ||
            req.admin?.tenantId;
        } else {
          tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
        }
      }

      if (actor === "guard") {
        tenantId = req.user?.tenant_id || req.user?.tenantId;
      }

      if (!tenantId) {
        return res.status(400).json({ message: "Missing tenantId" });
      }

      const { Tenant } = req.app.locals.models;
      const tenant = await Tenant.findByPk(tenantId);

      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // ✅ Step 2: Check ai_payroll_enabled (BLOCK if disabled)
      if (!tenant.ai_payroll_enabled) {
        return res.status(403).json({
          message: "AI payroll is disabled for this tenant",
          ai_payroll_enabled: false,
        });
      }

      // ✅ Step 3: Determine available data sources based on payroll_mode
      const mode = tenant.payroll_mode;
      const tools = {
        canAccessPaystubs: mode === "PAYSTUB_UPLOAD" || mode === "HYBRID",
        canAccessCalculated: mode === "CALCULATED" || mode === "HYBRID",
        mode: mode,
      };

      // ✅ Step 4: Attach to request for route handlers
      req.tenant = tenant;
      req.aiPayrollEnabled = true;
      req.aiPayrollMode = mode;
      req.aiPayrollTools = tools;

      return next();
    } catch (e) {
      console.error("Error in requireAIPayroll:", e);
      return res.status(500).json({ message: e.message });
    }
  };
};
