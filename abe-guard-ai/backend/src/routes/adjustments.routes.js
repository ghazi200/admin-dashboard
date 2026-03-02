/**
 * Payroll Adjustments Routes
 * 
 * Admin endpoints for managing payroll adjustments:
 * - List pending adjustments (especially AI-suggested)
 * - Approve/reject adjustments
 * - Create manual adjustments
 */

const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { Op } = require("sequelize");

const router = express.Router();

// All routes require admin authentication
router.use(auth);
router.use(requireRole(["admin"]));

/**
 * GET /api/admin/adjustments/pending
 * List all pending adjustments (especially AI-suggested ones)
 */
router.get("/pending", async (req, res) => {
  try {
    const { PayrollAdjustment } = req.app.locals.models;

    // Get tenant ID (enforce tenant isolation)
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    // Find pending adjustments
    const adjustments = await PayrollAdjustment.findAll({
      where: {
        tenant_id: tenantId,
        status: { [Op.in]: ["DRAFT", "PENDING_APPROVAL"] },
      },
      order: [
        ["suggested_by_ai", "DESC"], // AI suggestions first
        ["created_at", "DESC"],
      ],
      limit: 100,
    });

    return res.json(adjustments);
  } catch (e) {
    console.error("Error fetching pending adjustments:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * GET /api/admin/adjustments
 * List all adjustments (with optional filters)
 */
router.get("/", async (req, res) => {
  try {
    const { PayrollAdjustment } = req.app.locals.models;

    // Get tenant ID
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    // Build where clause
    const where = { tenant_id: tenantId };

    // Optional filters
    if (req.query.guardId) {
      where.guard_id = req.query.guardId;
    }
    if (req.query.payPeriodId) {
      where.pay_period_id = req.query.payPeriodId;
    }
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.suggestedByAi === "true") {
      where.suggested_by_ai = true;
    }

    const adjustments = await PayrollAdjustment.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    return res.json(adjustments);
  } catch (e) {
    console.error("Error fetching adjustments:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * POST /api/admin/adjustments/:id/approve
 * Approve a pending adjustment
 */
router.post("/:id/approve", async (req, res) => {
  try {
    const { PayrollAdjustment } = req.app.locals.models;

    // Get tenant ID
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const adjustmentId = req.params.id;
    const adminId = req.admin?.id || req.user?.id;

    // Find adjustment
    const adjustment = await PayrollAdjustment.findOne({
      where: {
        id: adjustmentId,
        tenant_id: tenantId,
      },
    });

    if (!adjustment) {
      return res.status(404).json({ message: "Adjustment not found" });
    }

    // Check if adjustment can be approved
    if (adjustment.status === "APPROVED") {
      return res.status(400).json({ message: "Adjustment is already approved" });
    }

    if (adjustment.status === "REJECTED") {
      return res.status(400).json({ message: "Cannot approve a rejected adjustment" });
    }

    if (adjustment.status === "APPLIED") {
      return res.status(400).json({ message: "Adjustment has already been applied" });
    }

    // Update adjustment
    await adjustment.update({
      status: "APPROVED",
      approved_by_admin_id: adminId,
      approved_at: new Date(),
    });

    return res.json({ ok: true, adjustment });
  } catch (e) {
    console.error("Error approving adjustment:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * POST /api/admin/adjustments/:id/reject
 * Reject a pending adjustment
 */
router.post("/:id/reject", async (req, res) => {
  try {
    const { PayrollAdjustment } = req.app.locals.models;

    // Get tenant ID
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const adjustmentId = req.params.id;
    const adminId = req.admin?.id || req.user?.id;

    // Find adjustment
    const adjustment = await PayrollAdjustment.findOne({
      where: {
        id: adjustmentId,
        tenant_id: tenantId,
      },
    });

    if (!adjustment) {
      return res.status(404).json({ message: "Adjustment not found" });
    }

    // Check if adjustment can be rejected
    if (adjustment.status === "REJECTED") {
      return res.status(400).json({ message: "Adjustment is already rejected" });
    }

    if (adjustment.status === "APPLIED") {
      return res.status(400).json({ message: "Cannot reject an applied adjustment" });
    }

    // Update adjustment
    await adjustment.update({
      status: "REJECTED",
      approved_by_admin_id: adminId, // Track who rejected it
      approved_at: new Date(),
    });

    return res.json({ ok: true, adjustment });
  } catch (e) {
    console.error("Error rejecting adjustment:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * POST /api/admin/adjustments
 * Create a manual adjustment (or create an AI-suggested adjustment as draft)
 */
router.post("/", async (req, res) => {
  try {
    const { PayrollAdjustment, PayPeriod } = req.app.locals.models;

    // Get tenant ID
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const adminId = req.admin?.id || req.user?.id;

    const {
      guard_id,
      pay_period_id,
      timesheet_id,
      adjustment_type,
      amount,
      description,
      suggested_by_ai = false,
      ai_suggestion_reason = null,
      status = "DRAFT", // Default to DRAFT for safety
    } = req.body;

    // Validate required fields
    if (!guard_id || !pay_period_id || !adjustment_type || amount === undefined || !description) {
      return res.status(400).json({ message: "Missing required fields: guard_id, pay_period_id, adjustment_type, amount, description" });
    }

    // Validate adjustment_type
    const allowedTypes = ["BONUS", "DEDUCTION", "CORRECTION", "AI_SUGGESTED"];
    if (!allowedTypes.includes(adjustment_type)) {
      return res.status(400).json({ message: "Invalid adjustment_type", allowed: allowedTypes });
    }

    // Validate status
    const allowedStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "APPLIED"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status", allowed: allowedStatuses });
    }

    // Safety guard: AI-suggested adjustments must start as DRAFT or PENDING_APPROVAL
    if (suggested_by_ai && !["DRAFT", "PENDING_APPROVAL"].includes(status)) {
      return res.status(400).json({
        message: "AI-suggested adjustments must start as DRAFT or PENDING_APPROVAL (requires approval)",
      });
    }

    // Verify pay period belongs to tenant
    const payPeriod = await PayPeriod.findOne({
      where: { id: pay_period_id, tenant_id: tenantId },
    });

    if (!payPeriod) {
      return res.status(404).json({ message: "Pay period not found" });
    }

    // Create adjustment
    const adjustment = await PayrollAdjustment.create({
      tenant_id: tenantId,
      guard_id,
      pay_period_id,
      timesheet_id: timesheet_id || null,
      adjustment_type,
      amount: parseFloat(amount),
      description,
      status,
      suggested_by_ai,
      ai_suggestion_reason: ai_suggestion_reason || null,
      requested_by_admin_id: adminId,
    });

    return res.json({ ok: true, adjustment });
  } catch (e) {
    console.error("Error creating adjustment:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * GET /api/admin/adjustments/:id
 * Get a single adjustment by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { PayrollAdjustment } = req.app.locals.models;

    // Get tenant ID
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";
    const tenantId = isSuperAdmin
      ? req.query?.tenantId || req.headers["x-tenant-id"] || req.admin?.tenant_id
      : req.admin?.tenant_id || req.user?.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const adjustment = await PayrollAdjustment.findOne({
      where: {
        id: req.params.id,
        tenant_id: tenantId,
      },
    });

    if (!adjustment) {
      return res.status(404).json({ message: "Adjustment not found" });
    }

    return res.json(adjustment);
  } catch (e) {
    console.error("Error fetching adjustment:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
