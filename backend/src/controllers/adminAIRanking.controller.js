// src/controllers/adminAIRanking.controller.js
/**
 * AI Ranking Controller
 * Handles AI decision data and admin overrides
 */

const { Op } = require("sequelize");

function isUUID(v) {
  // Standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // More lenient: just check format, not version/variant
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(String(v || "").trim());
}

/**
 * GET /api/admin/ai-ranking
 * Returns shifts with AI decision data (rankings, reasons for guard assignment)
 */
exports.getAIRankings = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const status = req.query.status || "OPEN"; // OPEN, CLOSED, or ALL

    let statusFilter = "";
    if (status !== "ALL") {
      statusFilter = `AND s.status = '${status}'`;
    }

    // Query shifts with AI decision data
    const [rows] = await sequelize.query(
      `
      SELECT 
        s.id,
        s.tenant_id,
        s.guard_id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.status,
        s.location,
        s.created_at,
        s.ai_decision,
        g.name as guard_name,
        g.email as guard_email
      FROM shifts s
      LEFT JOIN guards g ON s.guard_id = g.id
      WHERE s.ai_decision IS NOT NULL
        ${statusFilter}
      ORDER BY s.created_at DESC
      LIMIT 200
    `
    );

    // Transform to include AI ranking data
    const rankings = rows.map((shift) => {
      const aiDecision = shift.ai_decision || {};
      
      return {
        id: shift.id,
        shiftDate: shift.shift_date,
        shiftStart: shift.shift_start,
        shiftEnd: shift.shift_end,
        status: shift.status,
        location: shift.location,
        guardId: shift.guard_id,
        guardName: shift.guard_name || (shift.guard_id ? `Guard ${String(shift.guard_id).substring(0, 8)}` : "Unassigned"),
        guardEmail: shift.guard_email,
        createdAt: shift.created_at,
        // AI Decision data
        aiDecision: aiDecision,
        ranking: aiDecision.ranking || null,
        reasons: aiDecision.reasons || aiDecision.reason || null,
        confidence: aiDecision.confidence || null,
        suggestedGuardId: aiDecision.suggested_guard_id || aiDecision.suggestedGuardId || null,
        contactReason: aiDecision.contact_reason || aiDecision.contactReason || null,
        assignmentReason: aiDecision.assignment_reason || aiDecision.assignmentReason || null,
        isOverridden: aiDecision.overridden === true || (aiDecision.overridden_by !== null && aiDecision.overridden_by !== undefined),
        overriddenBy: aiDecision.overridden_by || null,
        overriddenAt: aiDecision.overridden_at || null,
      };
    });

    return res.json({
      data: rankings,
      total: rankings.length,
    });
  } catch (e) {
    console.error("getAIRankings error:", e);
    return res
      .status(500)
      .json({ message: "Failed to load AI rankings", error: e.message });
  }
};

/**
 * POST /api/admin/ai-ranking/:shiftId/override
 * Admin override of AI decision (e.g., assign different guard)
 */
exports.overrideAIDecision = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.shiftId || "").trim();
    const { guardId, reason } = req.body;
    // Get admin ID from auth middleware (stored in req.admin)
    const adminId = req.admin?.id || null;

    console.log("🔄 Override API called - shiftId:", shiftId);
    console.log("🔄 Override API called - shiftId length:", shiftId.length);
    console.log("🔄 Override API called - shiftId type:", typeof shiftId);
    console.log("🔄 Override API called - isUUID check:", isUUID(shiftId));

    if (!isUUID(shiftId)) {
      console.error("❌ Invalid UUID:", shiftId);
      return res.status(400).json({ message: "shift id must be a UUID", received: shiftId });
    }

    // Get current shift
    const [shiftRows] = await sequelize.query(
      `SELECT id, ai_decision, guard_id, status FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );

    if (!shiftRows?.[0]) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const currentShift = shiftRows[0];
    const currentAiDecision = currentShift.ai_decision || {};

    // Update AI decision with override info
    const updatedAiDecision = {
      ...currentAiDecision,
      overridden: true,
      overridden_by: adminId,
      overridden_at: new Date().toISOString(),
      override_reason: reason || "Admin override",
      original_guard_id: currentShift.guard_id,
      override_guard_id: guardId || null,
    };

    // Update shift
    let updateQuery = `
      UPDATE shifts 
      SET ai_decision = $1
    `;
    let bindParams = [JSON.stringify(updatedAiDecision)];

    // If guardId is provided, also update guard assignment
    // guardId can be empty string or null (optional)
    if (guardId && String(guardId).trim() !== "") {
      if (!isUUID(guardId)) {
        return res.status(400).json({ message: "guard id must be a UUID", received: guardId });
      }
      updateQuery += `, guard_id = $2, status = $3 WHERE id = $4`;
      bindParams.push(guardId);
      bindParams.push("CLOSED"); // Auto-close when assigned
      bindParams.push(shiftId);
    } else {
      updateQuery += ` WHERE id = $2`;
      bindParams.push(shiftId);
    }

    updateQuery += ` RETURNING *`;

    console.log("🔄 Executing override update query:", updateQuery);
    console.log("🔄 Bind params:", bindParams.map((p, i) => (i === 0 ? "[JSON]" : p)));

    const [updated] = await sequelize.query(updateQuery, {
      bind: bindParams,
    });

    if (!updated?.[0]) {
      console.error("❌ Override update returned no rows");
      return res.status(500).json({ message: "Override update failed - no rows returned" });
    }

    console.log("✅ Override update successful");
    console.log("✅ Updated shift status:", updated[0].status);
    console.log("✅ Updated shift guard_id:", updated[0].guard_id);
    console.log("✅ Updated AI decision:", JSON.stringify(updated[0].ai_decision));

    return res.json({
      success: true,
      message: guardId ? "AI decision overridden and guard assigned" : "AI decision overridden",
      shift: updated[0],
      override: {
        guardId: guardId || null,
        reason: reason || "Admin override",
        overriddenBy: adminId,
        overriddenAt: updatedAiDecision.overridden_at,
      },
    });
  } catch (e) {
    console.error("overrideAIDecision error:", e);
    return res
      .status(500)
      .json({ message: "Failed to override AI decision", error: e.message });
  }
};
