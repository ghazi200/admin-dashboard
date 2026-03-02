/**
 * Admin Shift Swap Controller
 * 
 * Handles admin approval/rejection of shift swaps
 */

const { getTenantWhere, canAccessTenant } = require("../utils/tenantFilter");

/**
 * GET /api/admin/shift-swaps
 * Get all shift swap requests (for admin review)
 */
exports.listShiftSwaps = async (req, res) => {
  try {
    const { ShiftSwap, Shift, Guard, sequelize } = req.app.locals.models;
    const { status } = req.query;

    const tenantWhere = getTenantWhere(req.admin);
    // Filter by swap's tenant_id OR shift's tenant_id (whichever exists)
    // If super_admin, no filter (tenantWhere is null)
    let tenantSql = "";
    if (tenantWhere && tenantWhere.tenant_id) {
      // Match if swap.tenant_id matches OR shift.tenant_id matches
      tenantSql = `AND (ss.tenant_id = '${tenantWhere.tenant_id}' OR s.tenant_id = '${tenantWhere.tenant_id}')`;
    }

    let statusFilter = "";
    if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
      statusFilter = `AND ss.status = '${status}'`;
    }

    // Debug logging
    console.log("[listShiftSwaps] Admin:", req.admin?.email, "Role:", req.admin?.role, "Tenant:", req.admin?.tenant_id);
    console.log("[listShiftSwaps] Tenant filter:", tenantSql || "NONE (super_admin)");
    console.log("[listShiftSwaps] Status filter:", statusFilter || "NONE");

    const [swaps] = await sequelize.query(`
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
    `);

    console.log("[listShiftSwaps] Found", swaps.length, "swaps");
    return res.json({ data: swaps });
  } catch (e) {
    console.error("listShiftSwaps error:", e);
    return res.status(500).json({ message: "Failed to load shift swaps", error: e.message });
  }
};

/**
 * POST /api/admin/shift-swaps/:id/approve
 * Approve a shift swap request
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

    // Get the original shift
    const originalShift = await Shift.findByPk(swap.shift_id);
    if (!originalShift) {
      return res.status(404).json({ message: "Original shift not found" });
    }

    // Verify tenant access
    if (originalShift.tenant_id && !canAccessTenant(req.admin, originalShift.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    // Use transaction to ensure atomicity
    await sequelize.transaction(async (t) => {
      // Update swap status
      // Note: approved_by expects UUID, but Admin.id might be integer
      // Set to null if admin.id is not a valid UUID format
      const adminId = req.admin.id;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(adminId));
      
      await swap.update(
        {
          status: "approved",
          approved_by: isUUID ? adminId : null, // Only set if it's a valid UUID
          admin_notes: admin_notes || swap.admin_notes,
        },
        { transaction: t }
      );

      // If target guard is specified, reassign the shift
      if (swap.target_guard_id) {
        await originalShift.update(
          { guard_id: swap.target_guard_id },
          { transaction: t }
        );

        // If target shift exists, swap the guards
        if (swap.target_shift_id) {
          const targetShift = await Shift.findByPk(swap.target_shift_id, { transaction: t });
          if (targetShift) {
            await targetShift.update(
              { guard_id: swap.requester_guard_id },
              { transaction: t }
            );
          }
        }
      } else {
        // Just remove guard from original shift (pick-up scenario)
        await originalShift.update({ guard_id: null }, { transaction: t });
      }

      // Notify guards (wrap in try-catch to prevent notification errors from failing the request)
      try {
        const { notify } = require("../utils/notify");
        await notify(req.app, {
          type: "SHIFT_SWAP_APPROVED",
          title: "Shift Swap Approved",
          message: `Your shift swap request has been approved`,
          entityType: "shift_swap",
          entityId: swap.id,
          meta: {
            guard_id: swap.requester_guard_id,
          },
          tenant_id: originalShift.tenant_id,
        });
      } catch (notifyError) {
        console.error("[approveShiftSwap] Notification error (non-fatal):", notifyError.message);
        // Continue even if notification fails
      }
    });

    // Get updated swap (without relations to avoid errors)
    const updatedSwap = await ShiftSwap.findByPk(swap.id);

    return res.json({ message: "Shift swap approved successfully", swap: updatedSwap || swap });
  } catch (e) {
    console.error("approveShiftSwap error:", e);
    console.error("Error stack:", e.stack);
    // Check if swap was actually updated (partial success)
    try {
      const checkSwap = await ShiftSwap.findByPk(req.params.id);
      if (checkSwap && checkSwap.status === "approved") {
        console.log("[approveShiftSwap] Swap was approved despite error, returning success");
        return res.json({ message: "Shift swap approved successfully", swap: checkSwap });
      }
    } catch (checkError) {
      // Ignore check errors
    }
    return res.status(500).json({ message: "Failed to approve swap", error: e.message });
  }
};

/**
 * POST /api/admin/shift-swaps/:id/reject
 * Reject a shift swap request
 */
exports.rejectShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift } = req.app.locals.models;
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

    // Verify tenant access
    if (originalShift.tenant_id && !canAccessTenant(req.admin, originalShift.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    // Note: approved_by expects UUID, but Admin.id might be integer
    // Set to null if admin.id is not a valid UUID format
    const adminId = req.admin.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(adminId));
    
    await swap.update({
      status: "rejected",
      approved_by: isUUID ? adminId : null, // Only set if it's a valid UUID
      admin_notes: admin_notes || swap.admin_notes,
    });

    // Notify guard (wrap in try-catch to prevent notification errors from failing the request)
    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_REJECTED",
        title: "Shift Swap Rejected",
        message: `Your shift swap request has been rejected${admin_notes ? `: ${admin_notes}` : ""}`,
        entityType: "shift_swap",
        entityId: swap.id,
        meta: {
          guard_id: swap.requester_guard_id,
        },
        tenant_id: originalShift.tenant_id,
      });
    } catch (notifyError) {
      console.error("[rejectShiftSwap] Notification error (non-fatal):", notifyError.message);
      // Continue even if notification fails
    }

    // Get updated swap (without relations to avoid errors)
    const updatedSwap = await ShiftSwap.findByPk(swap.id);

    return res.json({ message: "Shift swap rejected", swap: updatedSwap || swap });
  } catch (e) {
    console.error("rejectShiftSwap error:", e);
    console.error("Error stack:", e.stack);
    // Check if swap was actually updated (partial success)
    try {
      const checkSwap = await ShiftSwap.findByPk(req.params.id);
      if (checkSwap && checkSwap.status === "rejected") {
        console.log("[rejectShiftSwap] Swap was rejected despite error, returning success");
        return res.json({ message: "Shift swap rejected", swap: checkSwap });
      }
    } catch (checkError) {
      // Ignore check errors
    }
    return res.status(500).json({ message: "Failed to reject swap", error: e.message });
  }
};
