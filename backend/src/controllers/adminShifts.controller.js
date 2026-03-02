// backend/src/controllers/adminShifts.controller.js
//
// Schema-aligned to your REAL Postgres shifts table:
//
// shifts(
//   id uuid,
//   tenant_id uuid,
//   guard_id uuid,
//   shift_date date,
//   shift_start time,
//   shift_end time,
//   status text,            -- "OPEN" / "CLOSED"
//   created_at timestamp,
//   ai_decision jsonb
// )

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function normStatus(v) {
  const s = String(v || "OPEN").trim().toUpperCase();
  return s === "CLOSED" ? "CLOSED" : "OPEN";
}

/**
 * IMPORTANT:
 * - returns `undefined` if key not present (so update won't wipe columns)
 * - returns actual value (including null) if key exists
 */
function pickAny(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      return obj[k];
    }
  }
  return undefined;
}

// ✅ Tenant filtering utility
const { getTenantSqlFilter, ensureTenantId, canAccessTenant } = require("../utils/tenantFilter");

exports.listShifts = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    // Optional filters
    const status = req.query.status ? normStatus(req.query.status) : null;
    // ✅ Tenant isolation: Only allow Super Admin to filter by tenantId in query
    // Admins/Supervisors are automatically filtered to their tenant
    const tenantId = req.admin?.role === "super_admin" && req.query.tenantId 
      ? String(req.query.tenantId).trim() 
      : null;

    const where = [];
    const params = [];

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    
    // ✅ Tenant isolation: Auto-filter by admin's tenant (unless super_admin)
    const tenantFilter = getTenantSqlFilter(req.admin, params);
    if (tenantFilter) {
      where.push(tenantFilter);
    } else if (tenantId) {
      // Super Admin can optionally filter by specific tenant
      if (!isUUID(tenantId)) return res.status(400).json({ message: "tenantId must be a UUID" });
      params.push(tenantId);
      where.push(`tenant_id = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await sequelize.query(
      `
      SELECT
        id,
        tenant_id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        status,
        created_at,
        ai_decision,
        location
      FROM shifts
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT 500
      `,
      { bind: params }
    );

    return res.json(rows || []);
  } catch (e) {
    console.error("listShifts error:", e?.message || e);
    return res.status(500).json({ message: "Failed to load shifts", error: e.message });
  }
};

// ✅ CORRECT: getShift is OUTSIDE listShifts and uses raw SQL (schema-aligned)
exports.getShift = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.id || "").trim();

    // Your schema says shifts.id is uuid — keep this validation
    if (!isUUID(shiftId)) return res.status(400).json({ message: "shift id must be a UUID" });

    const [rows] = await sequelize.query(
      `
      SELECT
        id,
        tenant_id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        status,
        created_at,
        ai_decision,
        location
      FROM shifts
      WHERE id = $1
      LIMIT 1
      `,
      { bind: [shiftId] }
    );

    const shift = rows?.[0] || null;
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    // ✅ Tenant isolation: Check if admin can access this shift's tenant
    if (shift.tenant_id && !canAccessTenant(req.admin, shift.tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    return res.json(shift);
  } catch (e) {
    console.error("getShift error:", e?.message || e);
    return res.status(500).json({ message: "Get shift failed", error: e.message });
  }
};

exports.createShift = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const payload = req.body || {};

    // Support both schemas coming from UI
    let tenantId = pickAny(payload, ["tenantId", "tenant_id"]);
    
    // ✅ Tenant isolation: Auto-set tenant_id from admin's tenant (unless super_admin)
    const tenantData = ensureTenantId(req.admin, { tenant_id: tenantId });
    tenantId = tenantData.tenant_id;
    
    const shiftDate = pickAny(payload, ["shift_date", "shiftDate", "date"]);
    const shiftStart = pickAny(payload, ["shift_start", "shiftStart", "startTime", "start_time", "start"]);
    const shiftEnd = pickAny(payload, ["shift_end", "shiftEnd", "endTime", "end_time", "end"]);
    const guardId = pickAny(payload, ["guard_id", "guardId"]); // optional
    const status = normStatus(pickAny(payload, ["status"]) ?? "OPEN");
    const location = pickAny(payload, ["location", "site", "site_name", "siteName"]); // optional

    // Minimal validation (matches your real schema)
    if (tenantId !== undefined && tenantId !== null && String(tenantId).trim() !== "" && !isUUID(tenantId)) {
      return res.status(400).json({ message: "tenantId must be a UUID" });
    }
    if (guardId !== undefined && guardId !== null && String(guardId).trim() !== "" && !isUUID(guardId)) {
      return res.status(400).json({ message: "guardId must be a UUID" });
    }
    if (!shiftDate) return res.status(400).json({ message: "shift_date (date) is required" });
    if (!shiftStart) return res.status(400).json({ message: "shift_start (time) is required" });
    if (!shiftEnd) return res.status(400).json({ message: "shift_end (time) is required" });

    const [rows] = await sequelize.query(
      `
      INSERT INTO shifts (tenant_id, guard_id, shift_date, shift_start, shift_end, status, location)
      VALUES ($1, $2, $3::date, $4::time, $5::time, $6, $7)
      RETURNING *
      `,
      {
        bind: [
          tenantId ? String(tenantId).trim() : null,
          guardId ? String(guardId).trim() : null,
          String(shiftDate).trim(),
          String(shiftStart).trim(),
          String(shiftEnd).trim(),
          status,
          location ? String(location).trim() : null,
        ],
      }
    );

    const created = rows?.[0] || null;

    // ✅ AI-POWERED SHIFT OPTIMIZATION: Get recommendations if no guard assigned
    let optimizationResult = null;
    if (created && !created.guard_id) {
      try {
        const shiftOptimizationService = require("../services/shiftOptimization.service");
        const recommendations = await shiftOptimizationService.getOptimizedRecommendations(
          created,
          req.app.locals.models,
          { limit: 5 }
        );

        if (recommendations.length > 0) {
          // Store AI decision with top recommendation
          const topRecommendation = recommendations[0];
          const aiDecision = {
            ranking: 1,
            confidence: topRecommendation.totalScore / 100,
            suggested_guard_id: topRecommendation.guardId,
            suggested_guard_name: topRecommendation.guardName,
            total_score: topRecommendation.totalScore,
            scores: topRecommendation.scores,
            reasons: topRecommendation.reasons,
            match_quality: topRecommendation.matchQuality,
            assignment_reason: `AI recommendation: ${topRecommendation.totalScore}% match. ${topRecommendation.reasons.experience.join('; ')}`,
            ranked_guards: recommendations.map(r => ({
              guard_id: r.guardId,
              guard_name: r.guardName,
              score: r.totalScore,
              confidence: r.confidence
            })),
            decision_made_at: new Date().toISOString(),
            decision_type: 'shift_creation_recommendation'
          };

          // Update shift with AI decision
          await sequelize.query(
            `UPDATE shifts SET ai_decision = $1 WHERE id = $2`,
            { bind: [JSON.stringify(aiDecision), created.id] }
          );

          optimizationResult = {
            recommendations: recommendations,
            topRecommendation: topRecommendation,
            aiDecision: aiDecision
          };

          console.log(`🤖 AI optimization: Top recommendation is ${topRecommendation.guardName} (${topRecommendation.totalScore}% match)`);
        }
      } catch (optError) {
        // Don't fail shift creation if optimization fails
        console.warn("⚠️ Failed to optimize shift assignment:", optError.message);
      }
    }

    // ✅ ENHANCED EVENT CAPTURE: Create OpEvent for new shift
    if (created) {
      try {
        const opsEventService = require("../services/opsEvent.service");
        const models = req.app.locals.models;
        if (models && models.OpEvent) {
          await opsEventService.createOpEvent(
            {
              tenant_id: created.tenant_id,
              site_id: null, // Could map location to site_id if needed
              type: "SHIFT",
              severity: created.guard_id ? "LOW" : "MEDIUM", // Unassigned = higher risk
              title: created.guard_id ? "New Shift Created" : "New Unassigned Shift",
              summary: `Shift created: ${created.shift_date} ${created.shift_start}-${created.shift_end} at ${created.location || "Location TBD"}`,
              entity_refs: {
                shift_id: created.id,
                guard_id: created.guard_id || null,
              },
              created_at: new Date(),
            },
            models,
            true // Enable AI tagging
          );
        }
      } catch (opEventError) {
        // Don't fail shift creation if OpEvent creation fails
        console.warn("⚠️ Failed to create OpEvent for new shift:", opEventError.message);
      }

      // ✅ Emit socket event for real-time schedule updates
      const io = req.app.locals.io;
      if (io) {
        io.to("role:all").emit("shift_created", {
          shift: created,
          tenant_id: created.tenant_id,
          location: created.location,
        });
        console.log("📤 Emitted shift_created event for schedule update");
      }

      // ✅ SHIFT CHANGE ALERTS: Notify guard if shift is created with assignment
      if (created.guard_id) {
        try {
          const { createGuardNotification } = require("../utils/guardNotification");
          await createGuardNotification({
            sequelize,
            guardId: created.guard_id,
            type: "SHIFT_ASSIGNED",
            title: "New Shift Assigned",
            message: `You have been assigned a new shift on ${created.shift_date} from ${created.shift_start} to ${created.shift_end}${created.location ? ` at ${created.location}` : ""}`,
            shiftId: created.id,
            meta: {
              shiftDate: created.shift_date,
              shiftStart: created.shift_start,
              shiftEnd: created.shift_end,
              location: created.location,
            },
            io,
          });
        } catch (notificationError) {
          console.warn("⚠️ Failed to create guard notification for new shift:", notificationError.message);
        }
      }

      // ✅ Calculate callout risk if guard is assigned
      if (created.guard_id && created.status === 'CLOSED') {
        try {
          const calloutRiskService = require("../services/calloutRiskPrediction.service");
          const risk = await calloutRiskService.calculateCalloutRisk(created, req.app.locals.models);
          
          // Store risk score in shift metadata (if you have a metadata column)
          // For now, we'll calculate it on-demand via API
          
          // Send early warning notification if high risk
          if (risk.recommendation === 'HIGH_RISK') {
            const notify = require("../utils/notify").notify;
            await notify(req.app, {
              type: "CALLOUT_RISK_HIGH",
              title: "⚠️ High Callout Risk Detected",
              message: risk.message,
              entityType: "shift",
              entityId: null,
              audience: "all",
              meta: {
                shiftId: created.id,
                guardId: created.guard_id,
                guardName: risk.guardName,
                riskScore: risk.score,
                shiftDate: created.shift_date,
                shiftTime: `${created.shift_start}-${created.shift_end}`,
                location: created.location,
                factors: risk.factors,
              },
            });
            console.log(`⚠️ High callout risk detected for shift ${created.id}: ${risk.score}%`);
          }
        } catch (riskError) {
          // Don't fail shift creation if risk calculation fails
          console.warn("⚠️ Failed to calculate callout risk:", riskError.message);
        }
      }
    }

    // Return shift with optimization results if available
    const response = { ...created };
    if (optimizationResult) {
      response.aiRecommendations = optimizationResult.recommendations;
      response.topRecommendation = optimizationResult.topRecommendation;
    }

    return res.status(201).json(response);
  } catch (e) {
    console.error("createShift error:", e?.message || e);
    return res.status(500).json({ message: "Failed to create shift", error: e.message });
  }
};

exports.updateShift = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.id || "").trim();
    const payload = req.body || {};

    if (!isUUID(shiftId)) return res.status(400).json({ message: "shift id must be a UUID" });

    // ✅ Tenant isolation: Check if admin can access this shift
    const [existingShift] = await sequelize.query(
      `SELECT tenant_id FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );
    if (!existingShift?.[0]) return res.status(404).json({ message: "Shift not found" });
    if (existingShift[0].tenant_id && !canAccessTenant(req.admin, existingShift[0].tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }

    let tenantId = pickAny(payload, ["tenantId", "tenant_id"]);
    // ✅ Tenant isolation: Prevent admins from changing tenant_id (unless super_admin)
    if (tenantId !== undefined && req.admin?.role !== "super_admin") {
      // Admins cannot change tenant_id - use their own tenant
      const tenantData = ensureTenantId(req.admin, {});
      tenantId = tenantData.tenant_id;
    }
    const shiftDate = pickAny(payload, ["shift_date", "shiftDate", "date"]);
    const shiftStart = pickAny(payload, ["shift_start", "shiftStart", "startTime", "start_time", "start"]);
    const shiftEnd = pickAny(payload, ["shift_end", "shiftEnd", "endTime", "end_time", "end"]);
    const guardId = pickAny(payload, ["guard_id", "guardId"]);
    const statusRaw = pickAny(payload, ["status"]);

    if (tenantId !== undefined && tenantId !== null && String(tenantId).trim() !== "" && !isUUID(tenantId)) {
      return res.status(400).json({ message: "tenantId must be a UUID" });
    }
    if (guardId !== undefined && guardId !== null && String(guardId).trim() !== "" && !isUUID(guardId)) {
      return res.status(400).json({ message: "guardId must be a UUID" });
    }

    const sets = [];
    const params = [];

    const pushSet = (sqlFrag, value) => {
      params.push(value);
      sets.push(`${sqlFrag} = $${params.length}`);
    };

    // Only update fields that were provided (undefined = not provided)
    if (tenantId !== undefined) pushSet("tenant_id", tenantId ? String(tenantId).trim() : null);
    if (guardId !== undefined) pushSet("guard_id", guardId ? String(guardId).trim() : null);

    if (shiftDate !== undefined) {
      params.push(shiftDate ? String(shiftDate).trim() : null);
      sets.push(`shift_date = $${params.length}::date`);
    }
    if (shiftStart !== undefined) {
      params.push(shiftStart ? String(shiftStart).trim() : null);
      sets.push(`shift_start = $${params.length}::time`);
    }
    if (shiftEnd !== undefined) {
      params.push(shiftEnd ? String(shiftEnd).trim() : null);
      sets.push(`shift_end = $${params.length}::time`);
    }

    if (statusRaw !== undefined) pushSet("status", normStatus(statusRaw));

    if (sets.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    params.push(shiftId);

    // Get current shift status before update (store for comparison)
    const [currentShift] = await sequelize.query(
      `SELECT status, guard_id, shift_date, shift_start, shift_end, location FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );
    const previousStatus = currentShift[0]?.status;
    const previousGuardId = currentShift[0]?.guard_id;
    const previousShiftDate = currentShift[0]?.shift_date;
    const previousShiftStart = currentShift[0]?.shift_start;
    const previousShiftEnd = currentShift[0]?.shift_end;
    const previousLocation = currentShift[0]?.location;
    const wasOpen = previousStatus === "OPEN";

    const [rows] = await sequelize.query(
      `
      UPDATE shifts
      SET ${sets.join(", ")}
      WHERE id = $${params.length}
      RETURNING *
      `,
      { bind: params }
    );

    const updated = rows?.[0] || null;
    if (!updated) return res.status(404).json({ message: "Shift not found" });

    // ✅ Notify when shift is closed (was OPEN, now CLOSED)
    if (wasOpen && updated.status === "CLOSED" && updated.guard_id) {
      const notify = require("../utils/notify").notify;
      
      // Get assigned guard name
      const [guardRows] = await sequelize.query(
        `SELECT name, email FROM guards WHERE id = $1 LIMIT 1`,
        { bind: [updated.guard_id] }
      );
      const assignedGuardName = guardRows[0]?.name || guardRows[0]?.email || "Guard";
      
      // Check if there was a callout for this shift
      const [calloutRows] = await sequelize.query(
        `SELECT c.id, c.guard_id, c.reason, g.name as guard_name, g.email as guard_email
         FROM callouts c
         LEFT JOIN guards g ON c.guard_id = g.id
         WHERE c.shift_id = $1
         ORDER BY c.created_at DESC
         LIMIT 1`,
        { bind: [shiftId] }
      );
      
      let notificationMessage;
      let notificationTitle;
      const meta = {
        shiftId: updated.id,
        assignedGuardId: updated.guard_id,
        assignedGuardName: assignedGuardName,
        shiftDate: updated.shift_date,
        shiftTime: `${updated.shift_start}-${updated.shift_end}`,
        location: updated.location || null,
      };
      
      if (calloutRows.length > 0) {
        // There was a callout - link it to the assignment
        const callout = calloutRows[0];
        const calledOutGuardName = callout.guard_name || callout.guard_email || "Guard";
        const calloutReason = callout.reason || "Unknown reason";
        
        notificationTitle = "Shift Filled After Callout";
        notificationMessage = `${calledOutGuardName}'s shift (${calloutReason}) on ${updated.shift_date} ${updated.shift_start}-${updated.shift_end} has been assigned to ${assignedGuardName}`;
        
        meta.calloutId = callout.id;
        meta.calledOutGuardId = callout.guard_id;
        meta.calledOutGuardName = calledOutGuardName;
        meta.calloutReason = calloutReason;
      } else {
        // No callout - just a regular shift closure
        notificationTitle = "Shift Closed";
        notificationMessage = `Shift on ${updated.shift_date} ${updated.shift_start}-${updated.shift_end} has been closed and assigned to ${assignedGuardName}`;
      }
      
      await notify(req.app, {
        type: "SHIFT_CLOSED",
        title: notificationTitle,
        message: notificationMessage,
        entityType: "shift",
        entityId: null, // Using UUID
        audience: "all",
        meta: meta,
      });

      // ✅ ENHANCED EVENT CAPTURE: Create OpEvent for shift closure
      try {
        const opsEventService = require("../services/opsEvent.service");
        const models = req.app.locals.models;
        if (models && models.OpEvent) {
          await opsEventService.createOpEvent(
            {
              tenant_id: updated.tenant_id || null,
              site_id: null,
              type: "SHIFT",
              severity: "LOW",
              title: "Shift Closed",
              summary: notificationMessage,
              entity_refs: {
                shift_id: updated.id,
                guard_id: updated.guard_id,
                callout_id: meta.calloutId || null,
              },
              created_at: new Date(),
            },
            models,
            true // Enable AI tagging
          );
        }
      } catch (opEventError) {
        console.warn("⚠️ Failed to create OpEvent for shift closure:", opEventError.message);
      }

      // ✅ Emit shift_filled event (already handled by socket listeners in Dashboard)
      const io = req.app.locals.io;
      if (io) {
        io.to("role:all").emit("shift_filled", {
          shift: updated,
          tenant_id: updated.tenant_id,
          location: updated.location,
        });
        console.log("📤 Emitted shift_filled event for schedule update");
      }
    }

    // ✅ Emit shift_updated event for any shift update (for schedule page)
    const io = req.app.locals.io;
    if (io) {
      io.to("role:all").emit("shift_updated", {
        shift: updated,
        tenant_id: updated.tenant_id,
        location: updated.location,
        previousStatus: previousStatus,
        newStatus: updated.status,
      });
      console.log("📤 Emitted shift_updated event for schedule update");
    }

    // ✅ SHIFT CHANGE ALERTS: Notify guards of shift changes
    try {
      const { notifyShiftChanges } = require("../utils/guardNotification");
      
      const currentShiftData = {
        guard_id: previousGuardId,
        shift_date: previousShiftDate,
        shift_start: previousShiftStart,
        shift_end: previousShiftEnd,
        location: previousLocation,
        status: previousStatus,
      };

      const updatedShiftData = {
        id: updated.id,
        guard_id: updated.guard_id,
        shift_date: updated.shift_date,
        shift_start: updated.shift_start,
        shift_end: updated.shift_end,
        location: updated.location,
        status: updated.status,
      };

      await notifyShiftChanges({
        sequelize,
        currentShift: currentShiftData,
        updatedShift: updatedShiftData,
        io,
      });
    } catch (notificationError) {
      // Don't fail shift update if notification fails
      console.warn("⚠️ Failed to create guard notifications for shift change:", notificationError.message);
    }

    // ✅ ENHANCED EVENT CAPTURE: Create OpEvent for shift status changes
    if (previousStatus !== updated.status) {
      try {
        const opsEventService = require("../services/opsEvent.service");
        const models = req.app.locals.models;
        if (models && models.OpEvent && updated.status === "OPEN" && !updated.guard_id) {
          // Unassigned open shift = higher risk
          await opsEventService.createOpEvent(
            {
              tenant_id: updated.tenant_id || null,
              site_id: null,
              type: "SHIFT",
              severity: "MEDIUM",
              title: "Unassigned Shift",
              summary: `Shift ${updated.shift_date} ${updated.shift_start}-${updated.shift_end} is open and unassigned`,
              entity_refs: {
                shift_id: updated.id,
              },
              created_at: new Date(),
            },
            models,
            true // Enable AI tagging
          );
        }
      } catch (opEventError) {
        console.warn("⚠️ Failed to create OpEvent for shift status change:", opEventError.message);
      }
    }

    return res.json(updated);
  } catch (e) {
    console.error("updateShift error:", e?.message || e);
    return res.status(500).json({ message: "Failed to update shift", error: e.message });
  }
};

exports.getRunningLate = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.id || "").trim();

    if (!isUUID(shiftId)) {
      return res.status(400).json({ message: "shift id must be a UUID" });
    }

    // Get shift details
    const [rows] = await sequelize.query(
      `SELECT id, status, ai_decision FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );

    if (!rows?.[0]) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = rows[0];
    const lateInfo = shift.ai_decision?.running_late 
      ? { isLate: true, reason: shift.ai_decision.late_reason, markedAt: shift.ai_decision.marked_late_at }
      : { isLate: false };

    return res.json({
      shift: {
        id: shift.id,
        status: shift.status,
      },
      runningLate: lateInfo,
    });
  } catch (e) {
    console.error("getRunningLate error:", e?.message || e);
    return res.status(500).json({ message: "Failed to get shift running late status", error: e.message });
  }
};

exports.markRunningLate = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || req.body?.delayReason || "Running late").trim();

    if (!isUUID(shiftId)) {
      return res.status(400).json({ message: "shift id must be a UUID" });
    }

    // Check if shift exists
    const [existing] = await sequelize.query(
      `SELECT id, status FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );

    if (!existing?.[0]) {
      return res.status(404).json({ message: "Shift not found" });
    }

    // Update shift - you might want to store the reason in ai_decision or a separate field
    // For now, we'll just acknowledge the request and return success
    // If you have a "late_reason" or similar field, update it here
    
    // Option 1: Store in ai_decision JSONB field (if it exists)
    const [updated] = await sequelize.query(
      `
      UPDATE shifts
      SET ai_decision = COALESCE(ai_decision, '{}'::jsonb) || jsonb_build_object('running_late', true, 'late_reason', $1::text, 'marked_late_at', NOW())
      WHERE id = $2
      RETURNING *
      `,
      { bind: [reason, shiftId] }
    );

    if (!updated?.[0]) {
      return res.status(404).json({ message: "Shift not found" });
    }

    return res.json({
      success: true,
      shift: updated[0],
      message: `Shift marked as running late: ${reason}`,
    });
  } catch (e) {
    console.error("markRunningLate error:", e?.message || e);
    return res.status(500).json({ message: "Failed to mark shift as running late", error: e.message });
  }
};

exports.deleteShift = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = String(req.params.id || "").trim();

    if (!isUUID(shiftId)) return res.status(400).json({ message: "shift id must be a UUID" });

    // ✅ Tenant isolation: Check if admin can access this shift before deleting
    // Also get shift details for notification
    const [existingShift] = await sequelize.query(
      `SELECT tenant_id, guard_id, shift_date, shift_start, shift_end, location FROM shifts WHERE id = $1 LIMIT 1`,
      { bind: [shiftId] }
    );
    if (!existingShift?.[0]) return res.status(404).json({ message: "Shift not found" });
    if (existingShift[0].tenant_id && !canAccessTenant(req.admin, existingShift[0].tenant_id)) {
      return res.status(403).json({ message: "You don't have access to this shift" });
    }
    
    const shiftToDelete = existingShift[0];

    // Check for related records that might prevent deletion
    const [callouts] = await sequelize.query(
      `SELECT COUNT(*) as count FROM callouts WHERE shift_id = $1`,
      { bind: [shiftId] }
    );
    const [timeEntries] = await sequelize.query(
      `SELECT COUNT(*) as count FROM time_entries WHERE shift_id = $1`,
      { bind: [shiftId] }
    );
    const [shiftSwaps] = await sequelize.query(
      `SELECT COUNT(*) as count FROM shift_swaps WHERE shift_id = $1 OR target_shift_id = $1`,
      { bind: [shiftId] }
    );
    // Check ai_decisions (might not exist in all databases)
    let aiDecisionCount = 0;
    let aiDecisionRecords = [];
    try {
      // First, get the actual records to see what we're dealing with
      const [aiDecisionsList] = await sequelize.query(
        `SELECT id, shift_id FROM ai_decisions WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
      aiDecisionRecords = aiDecisionsList || [];
      aiDecisionCount = aiDecisionRecords.length;
      
      // Also get count for logging
      const [aiDecisionsCount] = await sequelize.query(
        `SELECT COUNT(*) as count FROM ai_decisions WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
      const countFromQuery = parseInt(aiDecisionsCount[0]?.count || 0);
      
      console.log(`Found ${aiDecisionCount} ai_decisions records for shift ${shiftId}:`, aiDecisionRecords);
      console.log(`Count query result: ${countFromQuery}`);
      
      if (aiDecisionCount !== countFromQuery) {
        console.warn(`Mismatch: List has ${aiDecisionCount} records, count query has ${countFromQuery}`);
      }
    } catch (e) {
      // Table might not exist, that's okay
      console.warn("ai_decisions table check failed (might not exist):", e.message);
      aiDecisionCount = 0;
    }

    const calloutCount = parseInt(callouts[0]?.count || 0);
    const timeEntryCount = parseInt(timeEntries[0]?.count || 0);
    const shiftSwapCount = parseInt(shiftSwaps[0]?.count || 0);

    console.log(`Deleting related records for shift ${shiftId}:`, {
      callouts: calloutCount,
      timeEntries: timeEntryCount,
      shiftSwaps: shiftSwapCount,
      aiDecisions: aiDecisionCount
    });

    // Delete related records first (cascade delete)
    // IMPORTANT: Delete ai_decisions FIRST as it has a strict foreign key constraint
    if (aiDecisionCount > 0 || aiDecisionRecords.length > 0) {
      console.log(`Deleting ai_decisions records for shift ${shiftId}...`);
      console.log(`Records to delete:`, aiDecisionRecords);
      
      try {
        // Try deleting by shift_id (most common case)
        const [deleteResult] = await sequelize.query(
          `DELETE FROM ai_decisions WHERE shift_id = $1`,
          { bind: [shiftId] }
        );
        console.log(`Delete query executed. Result:`, deleteResult);
        
        // Verify deletion worked
        const [verifyCount] = await sequelize.query(
          `SELECT COUNT(*) as count FROM ai_decisions WHERE shift_id = $1`,
          { bind: [shiftId] }
        );
        const remaining = parseInt(verifyCount[0]?.count || 0);
        
        if (remaining > 0) {
          console.warn(`Warning: ${remaining} ai_decisions records still exist after deletion attempt`);
          // Try deleting by individual IDs as fallback
          for (const record of aiDecisionRecords) {
            try {
              await sequelize.query(
                `DELETE FROM ai_decisions WHERE id = $1`,
                { bind: [record.id] }
              );
              console.log(`Deleted ai_decisions record ${record.id}`);
            } catch (idError) {
              console.error(`Failed to delete ai_decisions record ${record.id}:`, idError.message);
            }
          }
        } else {
          console.log(`Successfully deleted all ai_decisions for shift ${shiftId}`);
        }
      } catch (aiError) {
        console.error(`Failed to delete ai_decisions for shift ${shiftId}:`, aiError.message);
        console.error(`ai_decisions deletion error stack:`, aiError.stack);
        // If deletion fails, we can't proceed - throw error to be caught by outer catch
        throw new Error(`Cannot delete shift: Failed to remove AI decision records. ${aiError.message}`);
      }
    } else {
      console.log(`No ai_decisions records found for shift ${shiftId}`);
    }

    if (calloutCount > 0) {
      await sequelize.query(
        `DELETE FROM callouts WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
    }

    if (timeEntryCount > 0) {
      await sequelize.query(
        `DELETE FROM time_entries WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
    }

    if (shiftSwapCount > 0) {
      await sequelize.query(
        `DELETE FROM shift_swaps WHERE shift_id = $1 OR target_shift_id = $1`,
        { bind: [shiftId] }
      );
    }

    // Check for other potential foreign key references
    // Check op_events table (uses entity_refs JSONB, but might have direct shift_id in some cases)
    let opEventCount = 0;
    try {
      const [opEvents] = await sequelize.query(
        `SELECT COUNT(*) as count FROM ops_events WHERE entity_refs->>'shift_id' = $1`,
        { bind: [shiftId] }
      );
      opEventCount = parseInt(opEvents[0]?.count || 0);
      
      if (opEventCount > 0) {
        await sequelize.query(
          `DELETE FROM ops_events WHERE entity_refs->>'shift_id' = $1`,
          { bind: [shiftId] }
        );
      }
    } catch (e) {
      // Table might not exist or column structure different, ignore
      console.warn("Could not check/delete ops_events:", e.message);
    }

    // Check incidents table
    let incidentCount = 0;
    try {
      const [incidents] = await sequelize.query(
        `SELECT COUNT(*) as count FROM incidents WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
      incidentCount = parseInt(incidents[0]?.count || 0);
      
      if (incidentCount > 0) {
        await sequelize.query(
          `DELETE FROM incidents WHERE shift_id = $1`,
          { bind: [shiftId] }
        );
      }
    } catch (e) {
      console.warn("Could not check/delete incidents:", e.message);
    }

    // Check shift_reports table if it exists
    let shiftReportCount = 0;
    try {
      const [shiftReports] = await sequelize.query(
        `SELECT COUNT(*) as count FROM shift_reports WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
      shiftReportCount = parseInt(shiftReports[0]?.count || 0);
      
      if (shiftReportCount > 0) {
        await sequelize.query(
          `DELETE FROM shift_reports WHERE shift_id = $1`,
          { bind: [shiftId] }
        );
      }
    } catch (e) {
      // Table might not exist, ignore
      console.warn("Could not check/delete shift_reports:", e.message);
    }

    // Check shift_report_photos table if it exists
    let shiftReportPhotoCount = 0;
    try {
      const [shiftReportPhotos] = await sequelize.query(
        `SELECT COUNT(*) as count FROM shift_report_photos WHERE shift_id = $1`,
        { bind: [shiftId] }
      );
      shiftReportPhotoCount = parseInt(shiftReportPhotos[0]?.count || 0);
      
      if (shiftReportPhotoCount > 0) {
        await sequelize.query(
          `DELETE FROM shift_report_photos WHERE shift_id = $1`,
          { bind: [shiftId] }
        );
      }
    } catch (e) {
      // Table might not exist, ignore
      console.warn("Could not check/delete shift_report_photos:", e.message);
    }

    // Now delete the shift
    const [rows] = await sequelize.query(
      `DELETE FROM shifts WHERE id = $1 RETURNING id`,
      { bind: [shiftId] }
    );

    if (!rows?.[0]) return res.status(404).json({ message: "Shift not found" });

    // ✅ SHIFT CHANGE ALERTS: Notify guard if shift was deleted and had an assigned guard
    if (shiftToDelete.guard_id) {
      try {
        const { createGuardNotification } = require("../utils/guardNotification");
        const io = req.app.locals.io;
        await createGuardNotification({
          sequelize,
          guardId: shiftToDelete.guard_id,
          type: "SHIFT_CANCELLED",
          title: "Shift Cancelled",
          message: `Your shift on ${shiftToDelete.shift_date} from ${shiftToDelete.shift_start} to ${shiftToDelete.shift_end}${shiftToDelete.location ? ` at ${shiftToDelete.location}` : ""} has been cancelled`,
          shiftId: shiftId, // Shift is deleted, but we keep the ID for reference
          meta: {
            shiftDate: shiftToDelete.shift_date,
            shiftStart: shiftToDelete.shift_start,
            shiftEnd: shiftToDelete.shift_end,
            location: shiftToDelete.location,
            deletedAt: new Date().toISOString(),
          },
          io,
        });
      } catch (notificationError) {
        console.warn("⚠️ Failed to create guard notification for deleted shift:", notificationError.message);
      }
    }

    return res.json({ 
      success: true, 
      id: rows[0].id,
      deletedRelated: {
        callouts: calloutCount,
        timeEntries: timeEntryCount,
        shiftSwaps: shiftSwapCount,
        aiDecisions: aiDecisionCount,
        opEvents: opEventCount,
        incidents: incidentCount,
        shiftReports: shiftReportCount,
        shiftReportPhotos: shiftReportPhotoCount
      }
    });
  } catch (e) {
    console.error("deleteShift error:", e?.message || e);
    console.error("deleteShift error stack:", e?.stack);
    console.error("deleteShift shiftId:", shiftId);
    
    // Extract the constraint name from the error if it's a foreign key error
    let constraintName = null;
    let tableName = null;
    if (e.message && e.message.includes('foreign key constraint')) {
      const match = e.message.match(/constraint "([^"]+)"/);
      if (match) {
        constraintName = match[1];
      }
      // Try to extract table name
      const tableMatch = e.message.match(/on table "([^"]+)"/);
      if (tableMatch) {
        tableName = tableMatch[1];
      }
    }
    
    // Check for foreign key constraint errors
    if (e.message && e.message.includes('foreign key constraint')) {
      return res.status(409).json({ 
        message: `Cannot delete shift: It has related records in table "${tableName || 'unknown'}" that prevent deletion. Constraint: ${constraintName || 'unknown'}`,
        error: e.message,
        constraint: constraintName,
        table: tableName,
        shiftId: shiftId
      });
    }
    
    return res.status(500).json({ 
      message: "Failed to delete shift", 
      error: e.message,
      shiftId: shiftId
    });
  }
};
