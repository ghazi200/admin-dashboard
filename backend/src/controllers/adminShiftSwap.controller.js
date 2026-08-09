/**
 * Admin Shift Swap Controller
 *
 * Handles admin approval/rejection of shift swaps
 */

const { getTenantWhere, canAccessTenant } = require("../utils/tenantFilter");
const {
  isUUID,
  normId,
  checkShiftEligibleForSwap,
  shiftWhen,
  notifyGuardSwap,
} = require("../utils/shiftSwapHelpers");

/**
 * GET /api/admin/shift-swaps
 * Get all shift swap requests (for admin review)
 */
exports.listShiftSwaps = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const { status } = req.query;

    const tenantWhere = getTenantWhere(req.admin);
    const bind = [];
    let tenantSql = "";
    if (tenantWhere && tenantWhere.tenant_id) {
      bind.push(tenantWhere.tenant_id);
      tenantSql = `AND (ss.tenant_id = $${bind.length}::uuid OR s.tenant_id = $${bind.length}::uuid)`;
    }

    let statusFilter = "";
    if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
      bind.push(status);
      statusFilter = `AND ss.status = $${bind.length}`;
    }

    const [swaps] = await sequelize.query(
      `
      SELECT 
        ss.id,
        ss.shift_id,
        ss.requester_guard_id,
        ss.target_guard_id,
        ss.target_shift_id,
        ss.status,
        ss.reason,
        ss.admin_notes,
        ss.approved_by,
        ss.created_at,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status AS shift_status,
        s.pending_guard_id,
        rg.name as requester_name,
        rg.email as requester_email,
        tg.name as target_name,
        tg.email as target_email,
        ts.shift_date as target_shift_date,
        ts.shift_start as target_shift_start,
        ts.shift_end as target_shift_end
      FROM shift_swaps ss
      INNER JOIN shifts s ON ss.shift_id = s.id
      LEFT JOIN guards rg ON ss.requester_guard_id = rg.id
      LEFT JOIN guards tg ON ss.target_guard_id = tg.id
      LEFT JOIN shifts ts ON ss.target_shift_id = ts.id
      WHERE 1=1 ${tenantSql} ${statusFilter}
      ORDER BY ss.created_at DESC
      LIMIT 100
      `,
      { bind }
    );

    return res.json({ data: swaps });
  } catch (e) {
    console.error("listShiftSwaps error:", e);
    return res.status(500).json({ message: "Failed to load shift swaps", error: e.message });
  }
};

/**
 * POST /api/admin/shift-swaps/:id/approve
 * Approve a shift swap request (requires a claiming target guard)
 */
exports.approveShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift, sequelize } = req.app.locals.models;
    const swapId = req.params.id;
    const { admin_notes } = req.body;

    const swap = await ShiftSwap.findByPk(swapId);
    if (!swap) {
      return res.status(404).json({ message: "Shift swap not found" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ message: `Swap request is ${swap.status}, cannot approve` });
    }

    if (!swap.target_guard_id) {
      return res.status(400).json({
        message: "Cannot approve until another guard has claimed this swap",
      });
    }

    const originalShift = await Shift.findByPk(swap.shift_id);
    if (!originalShift) {
      return res.status(404).json({ message: "Original shift not found" });
    }

    if (originalShift.tenant_id && !canAccessTenant(req.admin, originalShift.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    const eligible = checkShiftEligibleForSwap(originalShift);
    if (!eligible.ok) {
      return res.status(eligible.status).json({ message: eligible.message });
    }

    if (normId(originalShift.guard_id) !== normId(swap.requester_guard_id)) {
      return res.status(409).json({
        message: "Shift is no longer assigned to the requester — cannot approve swap",
      });
    }

    const adminId = req.admin.id;
    const adminIsUuid = isUUID(adminId);

    await sequelize.transaction(async (t) => {
      // Re-check claim inside transaction
      const [locked] = await sequelize.query(
        `SELECT id, status, target_guard_id FROM shift_swaps WHERE id = $1::uuid FOR UPDATE`,
        { bind: [swapId], transaction: t }
      );
      const row = locked?.[0];
      if (!row || row.status !== "pending" || !row.target_guard_id) {
        const err = new Error("Swap is no longer pending with a claim");
        err.status = 409;
        throw err;
      }

      await swap.update(
        {
          status: "approved",
          approved_by: adminIsUuid ? adminId : null,
          admin_notes: admin_notes || swap.admin_notes,
        },
        { transaction: t }
      );

      await originalShift.update(
        {
          guard_id: swap.target_guard_id,
          // Clear any stale pending-accept fields if present
          ...(originalShift.pending_guard_id != null
            ? {
                pending_guard_id: null,
                accept_pending_until: null,
              }
            : {}),
        },
        { transaction: t }
      );

      if (swap.target_shift_id) {
        const targetShift = await Shift.findByPk(swap.target_shift_id, { transaction: t });
        if (targetShift) {
          const tgtOk = checkShiftEligibleForSwap(targetShift);
          if (!tgtOk.ok) {
            const err = new Error(tgtOk.message);
            err.status = tgtOk.status;
            throw err;
          }
          if (normId(targetShift.guard_id) !== normId(swap.target_guard_id)) {
            const err = new Error("Target shift is not assigned to the claiming guard");
            err.status = 409;
            throw err;
          }
          await targetShift.update(
            { guard_id: swap.requester_guard_id },
            { transaction: t }
          );
        }
      }
    });

    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_APPROVED",
        title: "Shift Swap Approved",
        message: `Shift swap approved for ${shiftWhen(originalShift)}`,
        entityType: "shift_swap",
        entityId: swap.id,
      });
    } catch (_) {
      /* non-fatal */
    }

    await notifyGuardSwap(req.app, {
      guardId: swap.requester_guard_id,
      type: "SHIFT_SWAP_APPROVED",
      title: "Swap approved",
      message: `Your swap for ${shiftWhen(originalShift)} was approved. The shift is now with the other guard.`,
      shiftId: swap.shift_id,
      swapId: swap.id,
      meta: { role: "requester" },
    });
    await notifyGuardSwap(req.app, {
      guardId: swap.target_guard_id,
      type: "SHIFT_SWAP_APPROVED",
      title: "Swap approved — shift is yours",
      message: `Your claim on ${shiftWhen(originalShift)} was approved. The shift is now assigned to you.`,
      shiftId: swap.shift_id,
      swapId: swap.id,
      meta: { role: "acceptor" },
    });

    const updatedSwap = await ShiftSwap.findByPk(swap.id);
    try {
      const { emitAuditEvent, actorFromAdmin } = require("../services/auditEvent.service");
      const actor = actorFromAdmin(req.admin);
      await emitAuditEvent(req.app, {
        tenantId: originalShift.tenant_id || req.admin?.tenant_id || null,
        ...actor,
        action: "shift_swap.approve",
        entityType: "shift_swap",
        entityId: swap.id,
        summary: `Approved shift swap for ${shiftWhen(originalShift)}`,
        after: {
          swapId: swap.id,
          shiftId: swap.shift_id,
          requesterGuardId: swap.requester_guard_id,
          targetGuardId: swap.target_guard_id,
        },
        meta: { adminNotes: admin_notes || null },
      });
    } catch (_) {
      /* non-fatal */
    }
    return res.json({ message: "Shift swap approved successfully", swap: updatedSwap || swap });
  } catch (e) {
    console.error("approveShiftSwap error:", e);
    const status = e.status || 500;
    return res.status(status).json({ message: e.message || "Failed to approve swap" });
  }
};

/**
 * POST /api/admin/shift-swaps/:id/reject
 * Reject a shift swap request
 */
exports.rejectShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift, sequelize } = req.app.locals.models;
    const swapId = req.params.id;
    const { admin_notes } = req.body;

    const swap = await ShiftSwap.findByPk(swapId);
    if (!swap) {
      return res.status(404).json({ message: "Shift swap not found" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ message: `Swap request is ${swap.status}, cannot reject` });
    }

    const originalShift = await Shift.findByPk(swap.shift_id);
    if (!originalShift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    if (originalShift.tenant_id && !canAccessTenant(req.admin, originalShift.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    const adminId = req.admin.id;
    const adminIsUuid = isUUID(adminId);
    const claimedBy = swap.target_guard_id;

    await sequelize.transaction(async (t) => {
      const [locked] = await sequelize.query(
        `SELECT id, status FROM shift_swaps WHERE id = $1::uuid FOR UPDATE`,
        { bind: [swapId], transaction: t }
      );
      if (!locked?.[0] || locked[0].status !== "pending") {
        const err = new Error("Swap is no longer pending");
        err.status = 409;
        throw err;
      }

      await swap.update(
        {
          status: "rejected",
          approved_by: adminIsUuid ? adminId : null,
          admin_notes: admin_notes || swap.admin_notes,
        },
        { transaction: t }
      );
    });

    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_REJECTED",
        title: "Shift Swap Rejected",
        message: `Shift swap rejected for ${shiftWhen(originalShift)}${
          admin_notes ? `: ${admin_notes}` : ""
        }`,
        entityType: "shift_swap",
        entityId: swap.id,
      });
    } catch (_) {
      /* non-fatal */
    }

    const reasonPart = admin_notes ? ` Reason: ${admin_notes}` : "";
    await notifyGuardSwap(req.app, {
      guardId: swap.requester_guard_id,
      type: "SHIFT_SWAP_REJECTED",
      title: "Swap rejected",
      message: `Your swap for ${shiftWhen(originalShift)} was rejected.${reasonPart}`,
      shiftId: swap.shift_id,
      swapId: swap.id,
      meta: { role: "requester" },
    });
    if (claimedBy) {
      await notifyGuardSwap(req.app, {
        guardId: claimedBy,
        type: "SHIFT_SWAP_REJECTED",
        title: "Swap claim rejected",
        message: `Your claim on ${shiftWhen(originalShift)} was rejected.${reasonPart}`,
        shiftId: swap.shift_id,
        swapId: swap.id,
        meta: { role: "acceptor" },
      });
    }

    const updatedSwap = await ShiftSwap.findByPk(swap.id);
    try {
      const { emitAuditEvent, actorFromAdmin } = require("../services/auditEvent.service");
      const actor = actorFromAdmin(req.admin);
      await emitAuditEvent(req.app, {
        tenantId: originalShift?.tenant_id || req.admin?.tenant_id || null,
        ...actor,
        action: "shift_swap.reject",
        entityType: "shift_swap",
        entityId: swap.id,
        summary: `Rejected shift swap for ${shiftWhen(originalShift)}`,
        after: {
          swapId: swap.id,
          shiftId: swap.shift_id,
          status: "rejected",
        },
        meta: { adminNotes: admin_notes || null },
      });
    } catch (_) {
      /* non-fatal */
    }
    return res.json({ message: "Shift swap rejected", swap: updatedSwap || swap });
  } catch (e) {
    console.error("rejectShiftSwap error:", e);
    const status = e.status || 500;
    return res.status(status).json({ message: e.message || "Failed to reject swap" });
  }
};
