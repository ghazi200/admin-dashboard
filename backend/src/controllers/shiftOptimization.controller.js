/**
 * Shift Optimization Controller
 * Handles API endpoints for AI-powered shift optimization
 */

const shiftOptimizationService = require("../services/shiftOptimization.service");

/**
 * GET /api/admin/shift-optimization/recommendations/:shiftId
 * Get optimized guard recommendations for a shift
 */
exports.getRecommendations = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = req.params.shiftId;
    const limit = parseInt(req.query.limit || 5, 10);

    // Get shift details
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        location,
        tenant_id,
        status
      FROM shifts
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [shiftId]
    });

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];

    // Get recommendations
    const recommendations = await shiftOptimizationService.getOptimizedRecommendations(
      shift,
      req.app.locals.models,
      { limit, excludeGuardId: shift.guard_id }
    );

    return res.json({
      shiftId: shift.id,
      shiftDate: shift.shift_date,
      shiftTime: `${shift.shift_start} - ${shift.shift_end}`,
      location: shift.location,
      currentGuardId: shift.guard_id,
      recommendations: recommendations,
      totalCandidates: recommendations.length
    });
  } catch (e) {
    console.error("getRecommendations error:", e);
    return res.status(500).json({
      message: "Failed to get optimization recommendations",
      error: e.message
    });
  }
};

/**
 * POST /api/admin/shift-optimization/auto-assign/:shiftId
 * Auto-assign best guard to shift based on AI optimization
 */
exports.autoAssign = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = req.params.shiftId;
    const { minScore = 60, autoAssign = true } = req.body;

    // Get shift details
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        location,
        tenant_id,
        status
      FROM shifts
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [shiftId]
    });

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];

    // Check if already assigned
    if (shift.guard_id) {
      return res.status(400).json({
        message: "Shift already has a guard assigned",
        currentGuardId: shift.guard_id
      });
    }

    // Get auto-assignment result
    const result = await shiftOptimizationService.autoAssignGuard(
      shift,
      req.app.locals.models,
      { autoAssign, minScore }
    );

    if (!result.success) {
      return res.json({
        success: false,
        message: result.message,
        recommendations: result.recommendations || [],
        topCandidate: result.topCandidate || null
      });
    }

    // Auto-assign if requested and successful
    if (autoAssign && result.assignedGuard) {
      // Check for conflicts before assigning
      const conflicts = await shiftOptimizationService.detectConflicts(
        shift,
        result.assignedGuard.guardId,
        req.app.locals.models
      );

      if (conflicts.hasConflicts) {
        return res.status(400).json({
          success: false,
          message: "Cannot auto-assign due to conflicts",
          conflicts: conflicts.details,
          recommendations: result.recommendations
        });
      }

      // Update shift with assigned guard and AI decision
      await sequelize.query(`
        UPDATE shifts
        SET guard_id = $1,
            status = $2,
            ai_decision = $3
        WHERE id = $4
        RETURNING *
      `, {
        bind: [
          result.assignedGuard.guardId,
          'CLOSED',
          JSON.stringify(result.aiDecision),
          shiftId
        ]
      });

      const emitToRealtime = req.app.locals.emitToRealtime;
      if (emitToRealtime) {
        emitToRealtime(req.app, "role:all", "shift_optimized", {
          shiftId: shift.id,
          assignedGuard: result.assignedGuard,
          aiDecision: result.aiDecision
        }).catch(() => {});
        console.log("📤 Published shift_optimized to realtime");
      }
    }

    return res.json({
      success: true,
      message: result.message,
      assignedGuard: result.assignedGuard,
      aiDecision: result.aiDecision,
      recommendations: result.recommendations
    });
  } catch (e) {
    console.error("autoAssign error:", e);
    return res.status(500).json({
      message: "Failed to auto-assign guard",
      error: e.message
    });
  }
};

/**
 * POST /api/admin/shift-optimization/check-conflicts
 * Check for conflicts before assigning a guard to a shift
 */
exports.checkConflicts = async (req, res) => {
  try {
    const { shiftId, guardId } = req.body;

    if (!shiftId || !guardId) {
      return res.status(400).json({
        message: "shiftId and guardId are required"
      });
    }

    // Get shift details
    const { sequelize } = req.app.locals.models;
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        location,
        tenant_id,
        status
      FROM shifts
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [shiftId]
    });

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];

    // Check conflicts
    const conflicts = await shiftOptimizationService.detectConflicts(
      shift,
      guardId,
      req.app.locals.models
    );

    return res.json({
      shiftId: shift.id,
      guardId: guardId,
      hasConflicts: conflicts.hasConflicts,
      conflicts: conflicts.details,
      canAssign: !conflicts.hasConflicts
    });
  } catch (e) {
    console.error("checkConflicts error:", e);
    return res.status(500).json({
      message: "Failed to check conflicts",
      error: e.message
    });
  }
};

/**
 * GET /api/admin/shift-optimization/score/:shiftId/:guardId
 * Get detailed score breakdown for a specific guard-shift combination
 */
exports.getGuardScore = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = req.params.shiftId;
    const guardId = req.params.guardId;

    // Get shift details
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        location,
        tenant_id,
        status
      FROM shifts
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [shiftId]
    });

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    // Get guard details
    const [guards] = await sequelize.query(`
      SELECT id, name, email
      FROM guards
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [guardId]
    });

    if (guards.length === 0) {
      return res.status(404).json({ message: "Guard not found" });
    }

    const shift = shifts[0];
    const guard = guards[0];

    // Calculate score
    const score = await shiftOptimizationService.calculateGuardScore(
      guard,
      shift,
      req.app.locals.models
    );

    // Check conflicts
    const conflicts = await shiftOptimizationService.detectConflicts(
      shift,
      guardId,
      req.app.locals.models
    );

    return res.json({
      shiftId: shift.id,
      guardId: guard.id,
      guardName: guard.name || guard.email,
      score: score,
      conflicts: conflicts,
      recommendation: score.totalScore >= 80 ? 'STRONGLY_RECOMMENDED' :
                      score.totalScore >= 60 ? 'RECOMMENDED' :
                      score.totalScore >= 40 ? 'ACCEPTABLE' : 'NOT_RECOMMENDED'
    });
  } catch (e) {
    console.error("getGuardScore error:", e);
    return res.status(500).json({
      message: "Failed to calculate guard score",
      error: e.message
    });
  }
};
